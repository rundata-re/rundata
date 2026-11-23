/**
 * The daily check of the sources through rundata.re (src/bin/check-sources.ts): `npx tsx scripts/check-sources.ts
 * [origin]`. Run every morning by .github/workflows/sources.yml. A point that fails is checked once more a minute
 * later; what still fails is printed, written to the job's summary, and fails the job: the failure is the alert.
 * A problem that a breakdown of scripts/pannes-amont.json covers (upstream, known, said on the site, dated, 7 days at
 * most) is a warning instead, in the summary too, and does not fail the job; so is an answer whose size follows the
 * day's data, past its cap but within its margin (SUIT_LES_DONNEES).
 */
import { appendFileSync, readFileSync } from "node:fs";
import "../src/bin/net.js";
import { AGENT, checkAnswer, checkPage, PAGES, pannesSummary, sizesSummary, taillesSummary, TOOLS, trierPannes, type PageCheck, type PanneConnue, type Probleme, type ToolCheck } from "../src/bin/check-sources.js";

const origin = process.argv[2] ?? "https://rundata.re";
const TIMEOUT_MS = 60_000;
const RETRY_MS = 60_000;
// The team's secret (the repository's secret RUNDATA_JETON): the check is then not counted as a visitor.
const JETON: Record<string, string> = process.env.RUNDATA_JETON ? { "rundata-jeton": process.env.RUNDATA_JETON } : {};

async function tool(c: ToolCheck): Promise<Probleme[]> {
  try {
    const r = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", "user-agent": AGENT, ...JETON },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: c.tool, arguments: c.args } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return [{ point: c.point, motif: `HTTP ${r.status}` }];
    const body = (await r.json()) as { result?: Parameters<typeof checkAnswer>[1]; error?: { message?: string } };
    if (body.error) return [{ point: c.point, motif: `erreur JSON-RPC : ${body.error.message ?? "?"}` }];
    return checkAnswer(c, body.result, new Date());
  } catch (err) {
    return [{ point: c.point, motif: `pas de réponse (${(err as Error).name})` }];
  }
}

async function page(c: PageCheck): Promise<Probleme[]> {
  try {
    const r = await fetch(`${origin}${c.path}`, { headers: { accept: c.json ? "application/json" : "text/html", "user-agent": AGENT, ...JETON }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return checkPage(c, r.status, r.headers.get("cache-control") ?? "", await r.text(), new Date());
  } catch (err) {
    return [{ point: c.path, motif: `pas de réponse (${(err as Error).name})` }];
  }
}

// One at a time: a check, not a load.
async function round(tools: ToolCheck[], pages: PageCheck[]): Promise<{ tools: Map<ToolCheck, Probleme[]>; pages: Map<PageCheck, Probleme[]> }> {
  const out = { tools: new Map<ToolCheck, Probleme[]>(), pages: new Map<PageCheck, Probleme[]>() };
  for (const c of tools) out.tools.set(c, await tool(c));
  for (const c of pages) out.pages.set(c, await page(c));
  return out;
}

const first = await round(TOOLS, PAGES);
const failing = { tools: TOOLS.filter((c) => first.tools.get(c)!.length), pages: PAGES.filter((c) => first.pages.get(c)!.length) };
let problems: Probleme[] = [];
if (failing.tools.length || failing.pages.length) {
  for (const p of [...first.tools.values(), ...first.pages.values()].flat()) console.log(`premier essai : ${p.point} : ${p.motif}${p.blocs ? ` (${p.blocs.map(([k, n]) => `${k} ${n}`).join(", ")})` : ""}`);
  console.log(`nouvel essai dans ${RETRY_MS / 1000} s`);
  await new Promise((r) => setTimeout(r, RETRY_MS));
  const again = await round(failing.tools, failing.pages);
  problems = [...again.tools.values(), ...again.pages.values()].flat();
}

const pannes = JSON.parse(readFileSync(new URL("./pannes-amont.json", import.meta.url), "utf8")) as PanneConnue[];
const tailles = problems.filter((p) => p.avertissement);
const { connus, echecs } = trierPannes(problems.filter((p) => !p.avertissement), pannes, new Date());

const total = TOOLS.length + PAGES.length;
const lines = echecs.map((p) => `| ${p.point} | ${p.motif.replace(/\|/g, "/")} |`);
const summary = (echecs.length
  ? `## Contrôle des sources : ${echecs.length} problème(s)\n\n| Point | Motif |\n|---|---|\n${lines.join("\n")}\n${sizesSummary(echecs)}`
  : `## Contrôle des sources : ${total} points, ${connus.length || tailles.length ? "rien d'autre qu'un avertissement" : "tout est à jour"}\n`) +
  pannesSummary(connus) +
  taillesSummary(tailles);
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
for (const { probleme: p, panne: e } of connus) console.log(`::warning::${p.point} : ${p.motif} (panne amont connue depuis le ${e.depuis}, jusqu'au ${e.jusqu_au})`);
for (const p of tailles) console.log(`::warning::${p.point} : ${p.motif}`);
for (const p of echecs) console.error(`::error::${p.point} : ${p.motif}`);
if (echecs.length) process.exitCode = 1;

/**
 * The devices' names and floors as the tool and the list by commune of /defibrillateurs write them (particules() of
 * src/noms.ts as the list is loaded, then nomDae() and etage(), src/tools/dae.ts), for the compact list « Autour de moi » loads (scripts/build-dae.py): the pairs [name,
 * floor] on standard input as a JSON array, the same pairs so written on standard output, in the same order, an empty
 * floor as "". Usage: called by scripts/build-dae.py.
 */
import { readFileSync } from "node:fs";
import { particules } from "../src/noms.js";
import { etage, nomDae } from "../src/tools/dae.js";

const lus: [string, string][] = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(lus.map(([nom, e]) => [nomDae(particules(nom)), etage(e) ?? ""])));

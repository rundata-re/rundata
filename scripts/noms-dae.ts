/**
 * The devices' names as the tool and the list by commune of /defibrillateurs write them (nomDae(), src/tools/dae.ts),
 * for the compact list « Autour de moi » loads (scripts/build-dae.py): the names on standard input as a JSON array, the
 * same names so written on standard output, in the same order. Usage: called by scripts/build-dae.py.
 */
import { readFileSync } from "node:fs";
import { nomDae } from "../src/tools/dae.js";

const noms: string[] = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(noms.map(nomDae)));

#!/usr/bin/env node
/** Local use: `npx reunion-temps-reel` in an MCP client config (Claude Desktop, Cursor…). */
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import "./net.js";
import { Cache } from "../cache.js";
import { installer } from "../contexte.js";
import { createServer } from "../server.js";

// Optional: with a key from portail-api.meteofrance.fr, the ~56 Météo-France stations are added.
installer({
  worker: false,
  secrets: {
    meteofranceApplication: process.env.METEOFRANCE_APPLICATION_ID,
    meteofranceCle: process.env.METEOFRANCE_API_KEY,
    meteofranceJeton: process.env.METEOFRANCE_TOKEN,
  },
});
await createServer(new Cache()).connect(new StdioServerTransport());

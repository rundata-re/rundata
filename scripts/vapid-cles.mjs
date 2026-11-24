#!/usr/bin/env node
// The VAPID key of the alerts on the phone (src/push/webpush.ts): a new P-256 key pair, written as a JWK on the
// standard output for `wrangler secret put` to read, never to a file nor to the screen. The public key, which is not
// secret, goes to the standard error so that it can be checked against GET /alertes/cle after the deploy.
//
//   node scripts/vapid-cles.mjs | npx wrangler secret put VAPID_PRIVE -c wrangler.essai.jsonc   # the trial Worker
//   node scripts/vapid-cles.mjs | npx wrangler secret put VAPID_PRIVE                            # production, another pair
//
// One pair a Worker: a browser subscribed on the trial Worker never receives production's alerts. Changing the key
// later cuts every subscription made with the old one (the browsers must subscribe again).
const { subtle } = globalThis.crypto;
if (process.stdout.isTTY) {
  console.error("Le JWK privé ne s'écrit pas à l'écran : envoyez-le dans « npx wrangler secret put VAPID_PRIVE … » (voir l'en-tête du script).");
  process.exit(1);
}
const paire = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await subtle.exportKey("jwk", paire.privateKey);
const publique = Buffer.from(await subtle.exportKey("raw", paire.publicKey)).toString("base64url");
process.stdout.write(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, d: jwk.d, x: jwk.x, y: jwk.y }));
console.error(`Clé publique VAPID : ${publique}`);

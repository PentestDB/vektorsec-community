#!/usr/bin/env node
/**
 * Dump the GraphQL schema of a live Mythic server.
 *
 * Mythic does not publish a stable operation list — its docs point you at the Hasura
 * console instead — and the schema varies with the Mythic version and with which
 * agents and C2 profiles the operator has installed. Run this against your server to
 * confirm the operation and field names used in src/services/mythic.client.ts, and to
 * discover anything extra your install exposes.
 *
 *   node scripts/mythic-introspect.mjs                       # reads MYTHIC_URL / MYTHIC_API_TOKEN from .env
 *   node scripts/mythic-introspect.mjs --full > schema.json  # full introspection JSON
 *   node scripts/mythic-introspect.mjs --grep callback       # names matching a pattern
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function readEnv() {
  const candidates = [
    process.env.MYTHIC_ENV_FILE,
    path.join(here, "..", ".env"),
    "/srv/data/.env",
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const out = {};
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Za-z0-9_\-.]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
      out[match[1]] = value;
    }
    return out;
  }
  return {};
}

const env = readEnv();
const url = (process.env.MYTHIC_URL || env.MYTHIC_URL || "").replace(/\/+$/, "");
const token = process.env.MYTHIC_API_TOKEN || env.MYTHIC_API_TOKEN || "";
const insecure =
  String(process.env.MYTHIC_INSECURE_TLS || env.MYTHIC_INSECURE_TLS || "").toLowerCase() === "true";

if (!url || !token) {
  console.error("MYTHIC_URL and MYTHIC_API_TOKEN must be set (in backend/.env or the environment).");
  process.exit(1);
}

const INTROSPECTION = `
query Introspect {
  __schema {
    queryType { name fields { name args { name type { name kind ofType { name kind } } } } }
    mutationType { name fields { name args { name type { name kind ofType { name kind } } } } }
    subscriptionType { name fields { name } }
  }
}`;

const FULL_INTROSPECTION = `
query FullIntrospect {
  __schema {
    types {
      name
      kind
      fields { name type { name kind ofType { name kind } } }
      inputFields { name type { name kind ofType { name kind } } }
    }
  }
}`;

const args = process.argv.slice(2);
const full = args.includes("--full");
const grepIndex = args.indexOf("--grep");
const grep = grepIndex >= 0 ? args[grepIndex + 1] : null;

const body = JSON.stringify({ query: full ? FULL_INTROSPECTION : INTROSPECTION });

const target = new URL(`${url}/graphql/`);
const request = https.request(
  {
    hostname: target.hostname,
    port: target.port || 443,
    path: target.pathname,
    method: "POST",
    rejectUnauthorized: !insecure,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      Authorization: `Bearer ${token}`,
      apitoken: token,
    },
  },
  (res) => {
    let raw = "";
    res.on("data", (chunk) => (raw += chunk));
    res.on("end", () => {
      if (res.statusCode >= 400) {
        console.error(`Mythic returned HTTP ${res.statusCode}: ${raw.slice(0, 500)}`);
        process.exit(1);
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        console.error(`Could not parse response: ${raw.slice(0, 500)}`);
        process.exit(1);
      }
      if (payload.errors) {
        console.error(`GraphQL errors: ${JSON.stringify(payload.errors, null, 2)}`);
        process.exit(1);
      }

      if (full) {
        console.log(JSON.stringify(payload.data, null, 2));
        return;
      }

      const schema = payload.data.__schema;
      const show = (label, type) => {
        if (!type?.fields) return;
        let fields = type.fields;
        if (grep) {
          const re = new RegExp(grep, "i");
          fields = fields.filter((f) => re.test(f.name));
        }
        console.log(`\n=== ${label} (${fields.length}) ===`);
        for (const field of fields) {
          const params = (field.args || [])
            .map((a) => `${a.name}: ${a.type?.name || a.type?.ofType?.name || a.type?.kind}`)
            .join(", ");
          console.log(`  ${field.name}${params ? `(${params})` : ""}`);
        }
      };

      show("Queries", schema.queryType);
      show("Mutations", schema.mutationType);
      show("Subscriptions", schema.subscriptionType);
    });
  },
);

request.on("error", (err) => {
  console.error(`Could not reach ${url}: ${err.message}`);
  if (err.code?.includes("CERT") || err.code?.startsWith("ERR_TLS")) {
    console.error("Mythic uses a self-signed certificate by default — set MYTHIC_INSECURE_TLS=true to accept it.");
  }
  process.exit(1);
});

request.write(body);
request.end();

/**
 * Diagnose what the browser can actually see in production:
 *  - for a list of routes, extract every /_next/ JS reference from the HTML
 *  - fetch each static JS and check whether a sourceMappingURL leaks
 *  - probe whether .next/server bundles or source maps are HTTP-accessible
 *
 * Requires the gateway to be running on PORT_GATEWAY (default 3001).
 * Run: node scripts/diagnose-sources.mjs [port]
 */

const PORT = parseInt(process.argv[2] || "3001", 10);
const BASE = `http://127.0.0.1:${PORT}`;

const ROUTES = [
  "/",
  "/login",
  "/register",
  "/pricing",
  "/docs",
  "/blog",
  "/blog/hello",
  "/terms",
  "/topup",
  "/checkout",
  "/no-access",
  "/onboarding",
  "/dashboard",
  "/admin",
  "/admin/users",
  "/admin/settings",
  "/admin/dashboard",
  "/admin/mcp-tokens",
  "/workspace/w1",
  "/session/s1",
  "/session/s1/vpn",
  "/session/s1/gui",
  "/session/s1/browser-agent",
  "/session/s1/vulnerabilities",
  "/session/s1/terminal/t1",
];

let withSourceMap = [];
let referenced = new Set();
let failures = [];
async function probe(url) {
  try {
    const r = await fetch(BASE + url, { redirect: "manual" });
    return r.status;
  } catch {
    return -1;
  }
}

for (const route of ROUTES) {
  let html;
  try {
    const r = await fetch(BASE + route, { redirect: "manual" });
    html = await r.text();
    if (!/^2\d\d$/.test(String(r.status))) {
      failures.push(`${route} -> HTTP ${r.status}`);
    }
  } catch (e) {
    failures.push(`${route} -> ${e.message}`);
    continue;
  }

  // All /_next/ JS references (script src, modulepreload, link as=script)
  const refs = html.match(/["'](\/_next\/[^"'?]+\.js)["']/g) || [];
  const jsRefs = [...new Set(refs.map((s) => s.replace(/^["']|["']$/g, "")))];
  for (const ref of jsRefs) {
    referenced.add(ref);
    if (!ref.includes("_buildManifest") && !ref.includes("_ssgManifest")) {
      const chunk = await (await fetch(BASE + ref)).text();
      if (chunk.includes("sourceMappingURL")) {
        withSourceMap.push({ route, ref });
      }
    }
  }
}

console.log(`\n=== Routes probed: ${ROUTES.length} | failures: ${failures.length}`);
if (failures.length) {
  console.log("Route failures:");
  failures.forEach((f) => console.log("  " + f));
}

console.log(`\n=== Unique /_next/ JS referenced: ${referenced.size}`);
if (withSourceMap.length) {
  console.log(`\n!!! ${withSourceMap.length} static JS chunk(s) leak a sourceMappingURL:`);
  for (const { route, ref } of withSourceMap) console.log(`  ${route} -> ${ref}`);
} else {
  console.log("No source maps leak from static chunks. ✅");
}

console.log("\n=== Sensitive /_next/ paths probed for HTTP exposure:");
const probes = [
  "/_next/server/app/login/page.js",
  "/_next/server/app/page.js",
  "/_next/server/chunks/ssr/11184_axios_lib_685040cc._.js",
  "/_next/server/pages-manifest.json",
  "/_next/server/app-paths-manifest.json",
  "/_next/static/chunks/4f324106f0c7a487.js.map",
  "/_next/server/app/login/page.js.map",
  "/_next/BUILD_ID",
];
for (const p of probes) {
  const status = await probe(p);
  console.log(`  ${status}  ${p}`);
}

// Inline <script> blocks count per route (RSC payload etc.)
console.log("\n=== Inline script blocks per route (first 3):");
for (const route of ["/", "/login", "/dashboard", "/admin/users"]) {
  const html = await (await fetch(BASE + route)).text();
  const inlineCount = (html.match(/<script>/g) || []).length;
  const hasNextFlight = html.includes("self.__next_f");
  console.log(`  ${route}: inline scripts=${inlineCount} self.__next_f=${hasNextFlight}`);
}

process.exit(0);

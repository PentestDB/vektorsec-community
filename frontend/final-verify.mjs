// Final consistency check: confirm the compiled CSS-module class map in the
// client chunk (loginCard) matches a selector present in the built CSS. With
// obfuscation disabled the class names are readable and must match 1:1.
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

const staticRoot = join(process.cwd(), ".next", "static");
if (!existsSync(staticRoot)) {
  console.error("❌ .next/static not found. Run `pnpm build` first.");
  process.exit(1);
}

function walk(dir, out = [], ext) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    try {
      if (statSync(p).isDirectory()) walk(p, out, ext);
      else if (p.endsWith(ext)) out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

const chunkDir = join(staticRoot, "chunks");
const files = existsSync(chunkDir)
  ? readdirSync(chunkDir).filter((f) => f.endsWith(".js"))
  : [];

let foundChunk = null;
let loginCardName = null;

for (const f of files) {
  const src = readFileSync(join(chunkDir, f), "utf8");
  // CSS-module map: standard build uses `loginCard:"...__loginCard"` (key
  // unquoted); an obfuscated build may emit `'loginCard':'...__loginCard'`.
  const m = src.match(/loginCard\s*[:=]\s*["']([^"']+)["']/);
  if (!m) continue;
  foundChunk = f;
  loginCardName = m[1];
  break;
}

console.log("chunk:", foundChunk);
console.log("loginCard class:", loginCardName);

if (loginCardName) {
  const cssFiles = walk(staticRoot, [], ".css");
  let inCss = false;
  for (const c of cssFiles) {
    if (readFileSync(c, "utf8").includes("." + loginCardName)) {
      inCss = true;
      break;
    }
  }
  console.log(`loginCard class .${loginCardName} in built CSS:`, inCss);
  console.log(inCss ? "✅ CONSISTENT — /admin will be styled" : "❌ MISMATCH");
  process.exit(inCss ? 0 : 1);
} else {
  console.log("could not locate the loginCard class map in the client chunks");
  process.exit(1);
}

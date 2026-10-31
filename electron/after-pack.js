/**
 * ============================================================================
 *  electron-builder `afterPack` guard — packaged node_modules must be portable
 * ============================================================================
 *
 *  The two servers ship their dependencies as real directories, produced by
 *  `scripts/stage-deps.mjs` (`pnpm install --prod --node-linker=hoisted`) and
 *  copied from `.stage/<pkg>/node_modules` via `extraResources`.
 *
 *  This hook fails the build when that assumption breaks, because the failure
 *  mode is silent and only shows up on a customer machine:
 *
 *   1. Any symlink/junction under `resources\app\<server>\node_modules` means a
 *      pnpm store link (absolute target into the build machine) slipped in, and
 *      NSIS would ship a reparse point that points nowhere on the user's PC.
 *   2. Every probe module has to resolve *inside* the packaged app — otherwise
 *      `require()` is reaching back into `D:\Project\vektorsec\...`.
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

/** Servers whose node_modules tree ships in the installer. */
const SERVERS = ["backend", "frontend"];

/** Modules that must resolve from each server at runtime. */
const PROBES = {
  backend: ["express", "mongoose", "redis"],
  frontend: ["next", "react", "antd", "http-proxy"],
};

/** Collect symlinks/junctions below `root` (bounded, for readable errors). */
function findReparsePoints(root, found = []) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      found.push(full);
      continue;
    }
    if (entry.isDirectory() && found.length < 50) findReparsePoints(full, found);
  }
  return found;
}

/** Resolve `request` from `cwd` in a child process and return the file path. */
function resolveFrom(cwd, request) {
  const res = spawnSync(
    process.execPath,
    ["-e", `process.stdout.write(require.resolve(${JSON.stringify(request)}))`],
    { cwd, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" } }
  );
  if (res.status !== 0) return null;
  return res.stdout.trim();
}

module.exports = async function afterPack(context) {
  const appDir = path.join(context.appOutDir, "resources", "app");
  const problems = [];

  for (const server of SERVERS) {
    const nodeModules = path.join(appDir, server, "node_modules");
    if (!fs.existsSync(nodeModules)) {
      problems.push(`${server}: node_modules missing — did scripts/stage-deps.mjs run?`);
      continue;
    }

    const links = findReparsePoints(nodeModules);
    if (links.length) {
      problems.push(
        `${server}: ${links.length} symlink/junction(s) in node_modules ` +
          `(first: ${path.relative(appDir, links[0])}) — ` +
          `rebuild the stage with scripts/stage-deps.mjs (node-linker=hoisted)`
      );
    }

    for (const request of PROBES[server]) {
      const resolved = resolveFrom(path.join(appDir, server), request);
      if (!resolved) {
        problems.push(`${server}: cannot resolve "${request}" from the package`);
      } else if (
        !path.resolve(resolved).toLowerCase().startsWith(appDir.toLowerCase())
      ) {
        problems.push(`${server}: "${request}" resolves outside the package -> ${resolved}`);
      }
    }
  }

  if (problems.length) {
    throw new Error(
      "[after-pack] packaged dependencies are not self-contained:\n  " + problems.join("\n  ")
    );
  }

  console.log(
    "[after-pack] packaged node_modules are portable (real dirs, in-package resolution)"
  );
};

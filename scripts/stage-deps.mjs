/**
 * ============================================================================
 *  Stage portable node_modules trees for the Windows installer
 * ============================================================================
 *
 *  `backend/` and `frontend/` are installed with pnpm, whose default layout is
 *  a store of junctions (`node_modules/<pkg>` -> `node_modules/.pnpm/...`) with
 *  ABSOLUTE targets. electron-builder copies those reparse points verbatim, so
 *  the packaged app could only work on the machine that built it — on a user's
 *  PC every `require()` fails with MODULE_NOT_FOUND. Shelling out from NSIS
 *  cannot fix that, and rewriting the links to relative ones does not work
 *  either (Windows resolves a junction's relative target against the process
 *  CWD, not against the link itself).
 *
 *  So the packaging step gets its own installs:
 *
 *    pnpm install --prod --frozen-lockfile --node-linker=hoisted
 *
 *  `--node-linker=hoisted` produces an npm-style tree of REAL directories (no
 *  reparse points), `--prod` drops typescript/eslint/tsx, and `--prefer-offline`
 *  reuses the local pnpm store so a rebuild needs no network. The result is
 *  copied by electron-builder's `extraResources` from `.stage/<pkg>/node_modules`.
 *
 *  Usage (called by `npm run package:win*`):
 *      node scripts/stage-deps.mjs
 * ============================================================================
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STAGE_ROOT = path.join(ROOT, ".stage");

/** Servers that ship their own node_modules, with the modules they must have. */
const PACKAGES = {
  backend: ["express", "mongoose", "redis", "socket.io", "bcrypt"],
  frontend: ["next", "@next/env", "http-proxy", "react", "react-dom", "antd"],
};

/** Copy the files pnpm needs to reproduce the locked dependency tree. */
function prepareStage(name) {
  const src = path.join(ROOT, name);
  const dest = path.join(STAGE_ROOT, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const file of ["package.json", "pnpm-lock.yaml", ".npmrc"]) {
    const from = path.join(src, file);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, file));
  }
  return dest;
}

/** Total bytes + reparse-point count of a tree (the two things that matter). */
function inspect(root) {
  let bytes = 0;
  let files = 0;
  let links = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        links += 1;
        continue;
      }
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        files += 1;
        try {
          bytes += fs.statSync(full).size;
        } catch (err) {
          // A file that vanished mid-walk only skews the size report.
        }
      }
    }
  };
  walk(root);
  return { mb: Math.round(bytes / 1048576), files, links };
}

function stageOne(name, required) {
  const dest = prepareStage(name);
  console.log(`\n[stage] ${name}: installing production tree with node-linker=hoisted`);

  const install = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "install",
      "--prod",
      "--frozen-lockfile",
      "--node-linker=hoisted",
      "--prefer-offline",
      "--reporter=append-only",
    ],
    { cwd: dest, stdio: "inherit", shell: process.platform === "win32" }
  );
  if (install.status !== 0) {
    throw new Error(`[stage] pnpm install failed for ${name} (exit ${install.status})`);
  }

  const nodeModules = path.join(dest, "node_modules");
  const report = inspect(nodeModules);
  console.log(
    `[stage] ${name}: ${report.files} files, ${report.mb} MB, ${report.links} reparse points`
  );
  if (report.links > 0) {
    throw new Error(
      `[stage] ${name}: ${report.links} symlink/junction(s) survived a hoisted install — ` +
        `the packaged app would not be portable`
    );
  }

  const missing = required.filter(
    (mod) => !fs.existsSync(path.join(nodeModules, mod, "package.json"))
  );
  if (missing.length) {
    throw new Error(`[stage] ${name}: missing production module(s): ${missing.join(", ")}`);
  }
  console.log(`[stage] ${name}: ${required.length} runtime modules verified`);
}

for (const [name, required] of Object.entries(PACKAGES)) {
  stageOne(name, required);
}
console.log("\n[stage] done — .stage is ready for electron-builder");

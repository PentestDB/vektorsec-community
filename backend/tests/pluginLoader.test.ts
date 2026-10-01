import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import {
  isPluginModuleFile,
  loadPlugins,
  resolvePluginDir,
  resolveRegisterFn,
} from "../src/tools/plugin-loader";
import { isToolRegistered, unregisterTool } from "../src/tools/plugin";

const PLUGIN_API_URL = pathToFileURL(
  path.resolve(__dirname, "../src/tools/plugin.ts"),
).href;

const TMP_TOOL_NAME = "temp_plugin_tool";
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vektorsec-plugin-test-"));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  unregisterTool(TMP_TOOL_NAME);
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("isPluginModuleFile accepts module files and ignores everything else", () => {
  assert.equal(isPluginModuleFile("my-plugin.ts"), true);
  assert.equal(isPluginModuleFile("my-plugin.js"), true);
  assert.equal(isPluginModuleFile("thing.mjs"), true);
  assert.equal(isPluginModuleFile("thing.cjs"), true);

  // Templates, docs, declarations, tests, barrels and dotfiles are not plugins.
  assert.equal(isPluginModuleFile("example-plugin.ts.example"), false);
  assert.equal(isPluginModuleFile("README.md"), false);
  assert.equal(isPluginModuleFile("types.d.ts"), false);
  assert.equal(isPluginModuleFile("plugin.test.ts"), false);
  assert.equal(isPluginModuleFile("plugin.spec.js"), false);
  assert.equal(isPluginModuleFile("index.ts"), false);
  assert.equal(isPluginModuleFile(".hidden.ts"), false);
  assert.equal(isPluginModuleFile("notes.txt"), false);
  assert.equal(isPluginModuleFile(""), false);
});

test("resolveRegisterFn understands the supported export shapes", () => {
  const named = () => "named";
  const defaultFn = () => "default-fn";
  const fromDefaultObject = () => "default-object";

  assert.equal(resolveRegisterFn({ register: named }), named);
  assert.equal(resolveRegisterFn({ default: defaultFn }), defaultFn);
  assert.equal(resolveRegisterFn({ default: { register: fromDefaultObject } }), fromDefaultObject);
  assert.equal(resolveRegisterFn({}), null);
  assert.equal(resolveRegisterFn({ default: { other: 1 } }), null);
  assert.equal(resolveRegisterFn(null), null);
});

test("resolvePluginDir prefers TOOLS_EXTENSIONS_DIR", () => {
  const override = path.join(os.tmpdir(), "plugins-here");
  assert.equal(resolvePluginDir({ TOOLS_EXTENSIONS_DIR: override }), override);

  const fallback = resolvePluginDir({});
  assert.equal(path.basename(fallback), "extensions");
  assert.ok(path.isAbsolute(fallback));
});

test("loadPlugins reports a missing directory instead of throwing", async () => {
  const result = await loadPlugins({
    directory: path.join(os.tmpdir(), "vektorsec-does-not-exist"),
    log: () => {},
  });

  assert.equal(result.directoryFound, false);
  assert.equal(result.scanned, 0);
  assert.equal(result.loaded, 0);
  assert.deepEqual(result.plugins, []);
});

test("loadPlugins registers working plugins and survives broken ones", async () => {
  const dir = makeTempDir();

  // 01: registers a tool through the real plugin API.
  fs.writeFileSync(
    path.join(dir, "01-ok.ts"),
    [
      `import { defineTool, registerTool } from ${JSON.stringify(PLUGIN_API_URL)};`,
      `export function register() {`,
      `  registerTool(defineTool({`,
      `    name: ${JSON.stringify(TMP_TOOL_NAME)},`,
      `    description: "registered by the loader test",`,
      `    parameters: { type: "object", properties: {} },`,
      `    async execute() { return { output: "ok", exitCode: 0 }; },`,
      `  }));`,
      `}`,
    ].join("\n"),
  );

  // 02: throws while loading.
  fs.writeFileSync(
    path.join(dir, "02-broken.ts"),
    `export function register() { throw new Error("plugin exploded"); }`,
  );

  // 03: exports something that is not a register function.
  fs.writeFileSync(path.join(dir, "03-not-a-plugin.ts"), `export const value = 42;`);

  // Ignored entries.
  fs.writeFileSync(path.join(dir, "README.md"), "# nope");
  fs.writeFileSync(path.join(dir, "04-template.ts.example"), "export function register() {}");

  const logs: string[] = [];
  const result = await loadPlugins({ directory: dir, log: (line) => logs.push(line) });

  assert.equal(result.directoryFound, true);
  assert.equal(result.scanned, 3, "only the three module files are scanned");
  assert.equal(result.loaded, 1);
  assert.equal(result.failed, 2);

  const ok = result.plugins.find((plugin) => plugin.file === "01-ok.ts");
  assert.deepEqual(ok?.registered, [TMP_TOOL_NAME]);
  assert.equal(isToolRegistered(TMP_TOOL_NAME), true, "the tool reached the registry");

  const broken = result.plugins.find((plugin) => plugin.file === "02-broken.ts");
  assert.equal(broken?.ok, false);
  assert.match(broken?.error ?? "", /plugin exploded/);

  const notAPlugin = result.plugins.find((plugin) => plugin.file === "03-not-a-plugin.ts");
  assert.equal(notAPlugin?.ok, false);
  assert.match(notAPlugin?.error ?? "", /register/);

  assert.ok(logs.some((line) => line.includes("loaded 01-ok.ts")));
  assert.ok(logs.some((line) => line.includes("02-broken.ts failed")));
});

test("loadPlugins is safe to run twice (plugins should be idempotent)", async () => {
  const dir = makeTempDir();
  fs.writeFileSync(
    path.join(dir, "plugin.ts"),
    [
      `import { defineTool, isToolRegistered, registerTool } from ${JSON.stringify(PLUGIN_API_URL)};`,
      `export function register() {`,
      `  if (isToolRegistered("idempotent_plugin_tool")) return;`,
      `  registerTool(defineTool({`,
      `    name: "idempotent_plugin_tool",`,
      `    description: "idempotent plugin tool",`,
      `    parameters: { type: "object", properties: {} },`,
      `    async execute() { return { output: "", exitCode: 0 }; },`,
      `  }));`,
      `}`,
    ].join("\n"),
  );

  const first = await loadPlugins({ directory: dir, log: () => {} });
  const second = await loadPlugins({ directory: dir, log: () => {} });

  assert.equal(first.loaded, 1);
  assert.equal(second.loaded, 1);
  assert.equal(second.failed, 0);

  unregisterTool("idempotent_plugin_tool");
});

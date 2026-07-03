import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the data dir at a scratch directory before importing the store so the
// module resolves the registry path there (see resolveDataDir → DATA_DIR).
let dataDir: string;
before(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "model-registry-"));
  process.env.DATA_DIR = dataDir;
});
after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

async function loadStore() {
  return import("../src/utils/modelRegistryStore");
}

const preset = {
  label: "Orchestrator",
  provider: "anthropic",
  model: "claude-opus-4-8",
};

test("writeModelRegistry writes the registry file in place", async () => {
  const store = await loadStore();
  const registry = store.writeModelRegistry([preset], {}, false);

  const registryPath = store.getModelRegistryPath();
  assert.equal(registryPath, path.join(dataDir, "model-registry.json"));
  assert.equal(fs.existsSync(registryPath), true);

  const onDisk = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  assert.equal(onDisk.models[0].model, "claude-opus-4-8");
  assert.equal(onDisk.assignments.orchestratorModelId, registry.models[0].id);
});

test("writeModelRegistry leaves no .tmp sibling (no rename-over-mount)", async () => {
  const store = await loadStore();
  store.writeModelRegistry([preset], {}, false);

  const leftovers = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("overwriting an existing registry updates content without a rename", async () => {
  const store = await loadStore();
  store.writeModelRegistry([preset], {}, false);
  store.writeModelRegistry(
    [{ ...preset, label: "Updated", model: "claude-sonnet-5" }],
    {},
    false,
  );

  const onDisk = JSON.parse(
    fs.readFileSync(store.getModelRegistryPath(), "utf-8"),
  );
  assert.equal(onDisk.models[0].model, "claude-sonnet-5");
  assert.equal(fs.readdirSync(dataDir).some((f) => f.endsWith(".tmp")), false);
});

test("readModelRegistry round-trips the written registry", async () => {
  const store = await loadStore();
  store.writeModelRegistry([preset], {}, false);

  const loaded = store.readModelRegistry();
  assert.equal(loaded.models.length, 1);
  assert.equal(loaded.models[0].model, "claude-opus-4-8");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSSHConfigAliases,
  parseSSHGOutput,
  normalizeManagedInput,
  managedProfileToConfig,
  LEGACY_PROFILE_ALIAS,
} from "../src/services/ssh-profile.service";
import { ShellManager } from "../src/services/shell.manager";
import {
  resolveWorkHostRecords,
  execOnResolvedWorkHost,
  listResolvedWorkHostDirectories,
  shellFolderExpression,
  testWorkHost,
  validateWorkFolder,
  defaultWorkFolder,
  defaultRemoteWorkFolder,
} from "../src/services/work-host.service";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The local work-host tests below execute real shell commands. The transport
 * uses `/bin/sh`, which does not exist on Windows, so those cases are skipped
 * there — they run on Linux/macOS and in CI.
 */
const needsPosixShell =
  process.platform === "win32"
    ? "requires a POSIX shell (/bin/sh) for local work-host execution"
    : false;

test("discovers only concrete SSH host aliases", () => {
  const aliases = parseSSHConfigAliases(`
Host box-a box-b
  HostName 10.0.0.1
Host *.internal !blocked.internal
  User root
Host box-c
  HostName example.test
`);
  assert.deepEqual(aliases, ["box-a", "box-b", "box-c"]);
});

test("parses repeated ssh -G fields", () => {
  const parsed = parseSSHGOutput(`
host box-a
hostname 10.0.0.1
user admin
port 2222
identityfile ~/.ssh/id_ed25519
identityfile ~/.ssh/id_rsa
`);
  assert.equal(parsed.hostname[0], "10.0.0.1");
  assert.equal(parsed.user[0], "admin");
  assert.deepEqual(parsed.identityfile, ["~/.ssh/id_ed25519", "~/.ssh/id_rsa"]);
});

test("normalizeManagedInput parses form values and requires an auth method", () => {
  const profile = normalizeManagedInput({
    alias: "kali-wsl",
    label: "WSL Kali",
    host: "10.0.0.1",
    port: "2222",
    username: "root",
    password: "secret",
  });
  assert.equal(profile.alias, "kali-wsl");
  assert.equal(profile.label, "WSL Kali");
  assert.equal(profile.port, 2222);
  assert.equal(profile.password, "secret");
  assert.equal(profile.privateKeyPath, undefined);

  // No auth method → the test would have nothing to authenticate with.
  assert.throws(
    () => normalizeManagedInput({ alias: "kali-wsl", host: "10.0.0.1", username: "root" }),
    /auth method/,
  );
  // Invalid alias.
  assert.throws(
    () => normalizeManagedInput({ alias: "bad alias", host: "10.0.0.1", username: "root", password: "x" }),
    /Profile name/,
  );
  // Missing host/username.
  assert.throws(
    () => normalizeManagedInput({ alias: "kali-wsl", username: "root", password: "x" }),
    /Host and username/,
  );
});

test("managedProfileToConfig resolves an existing key file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pc-ssh-key-"));
  const keyPath = path.join(dir, "id_test");
  fs.writeFileSync(keyPath, "FAKE-KEY");
  try {
    const config = managedProfileToConfig({
      alias: "key-box",
      label: "Key Box",
      host: "10.0.0.9",
      port: 22,
      username: "tester",
      privateKeyPath: keyPath,
    });
    assert.equal(config.host, "10.0.0.9");
    assert.equal(config.port, 22);
    assert.equal(config.username, "tester");
    assert.equal(config.privateKey, "FAKE-KEY");
    assert.equal(config.password, undefined);
    assert.equal(config.tryKeyboard, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sessions in one workspace resolve the same local host and folder", async () => {
  const workspace = {
    workspaceId: "workspace-one",
    workHost: { kind: "local" as const, workFolder: "/tmp/work folder" },
  };
  const first = await resolveWorkHostRecords({ workspaceId: "workspace-one" }, workspace);
  const second = await resolveWorkHostRecords({ workspaceId: "workspace-one" }, workspace);
  assert.deepEqual(first, second);
  assert.equal(first.workFolder, "/tmp/work folder");
});

test("session to workspace resolution rejects mismatched records", async () => {
  await assert.rejects(
    resolveWorkHostRecords(
      { workspaceId: "workspace-one" },
      { workspaceId: "workspace-two", workHost: { kind: "local", workFolder: "/tmp/work" } },
    ),
    /does not belong/,
  );
});

test("SSH work host stores an alias and resolves credentials outside Mongo", async () => {
  const target = await resolveWorkHostRecords(
    { workspaceId: "workspace-one" },
    {
      workspaceId: "workspace-one",
      workHost: { kind: "ssh", workFolder: "~/client work", sshProfileAlias: "kali-lab" },
    },
    async (alias) => ({
      summary: { alias, label: alias, host: "10.0.0.7", port: 22, username: "tester", source: "ssh_config", available: true },
      config: { host: "10.0.0.7", port: 22, username: "tester", privateKey: "not-persisted" },
    }),
  );
  assert.equal(target.sshProfileAlias, "kali-lab");
  assert.equal(target.sshConfig?.privateKey, "not-persisted");
});

/** Runs `run` with the legacy `SSH_*` environment overridden, then restores it. */
async function withLegacySSHEnv<T>(
  values: { SSH_HOST?: string; SSH_USERNAME?: string },
  run: () => Promise<T>,
): Promise<T> {
  const keys = ["SSH_HOST", "SSH_USERNAME"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("a workspace with no work host inherits the environment SSH box", async () => {
  await withLegacySSHEnv({ SSH_HOST: "172.26.249.177", SSH_USERNAME: "root" }, async () => {
    const requested: string[] = [];
    const target = await resolveWorkHostRecords(
      { workspaceId: "workspace-one" },
      { workspaceId: "workspace-one" },
      async (alias) => {
        requested.push(alias);
        return {
          summary: {
            alias,
            label: "Legacy environment default",
            host: "172.26.249.177",
            port: 2222,
            username: "root",
            source: "legacy_env" as const,
            available: true,
          },
          config: { host: "172.26.249.177", port: 2222, username: "root", password: "secret" },
        };
      },
    );
    // The legacy profile resolves the credentials — no alias is stored in Mongo.
    assert.deepEqual(requested, [LEGACY_PROFILE_ALIAS]);
    assert.equal(target.kind, "ssh");
    assert.equal(target.sshProfileAlias, LEGACY_PROFILE_ALIAS);
    assert.equal(target.sshConfig?.password, "secret");
    assert.equal(target.workFolder, defaultRemoteWorkFolder("workspace-one"));
    // Remote hosts keep their files in the remote home, not a container path.
    assert.equal(target.workFolder, "~/pentest-workspaces/workspace-one");
  });
});

test("a workspace with no work host stays local when no environment SSH box exists", async () => {
  await withLegacySSHEnv({}, async () => {
    let resolverCalled = false;
    const target = await resolveWorkHostRecords(
      { workspaceId: "workspace-two" },
      { workspaceId: "workspace-two" },
      async () => {
        resolverCalled = true;
        throw new Error("no legacy profile should be resolved without SSH_* config");
      },
    );
    assert.equal(resolverCalled, false);
    assert.equal(target.kind, "local");
    assert.equal(target.workFolder, defaultWorkFolder("workspace-two"));
  });
});

test("an unusable environment SSH box falls back to the local host", async () => {
  await withLegacySSHEnv({ SSH_HOST: "172.26.249.177", SSH_USERNAME: "root" }, async () => {
    // Profile exists but no credential could be loaded → unusable.
    const unavailable = await resolveWorkHostRecords(
      { workspaceId: "workspace-three" },
      { workspaceId: "workspace-three" },
      async (alias) => ({
        summary: {
          alias,
          label: "Legacy environment default",
          host: "172.26.249.177",
          port: 22,
          username: "root",
          source: "legacy_env" as const,
          available: false,
          error: "The legacy credential could not be loaded",
        },
        config: { host: "172.26.249.177", port: 22, username: "root" },
      }),
    );
    assert.equal(unavailable.kind, "local");

    // A resolver failure must never break every command in the workspace.
    const throwing = await resolveWorkHostRecords(
      { workspaceId: "workspace-three" },
      { workspaceId: "workspace-three" },
      async () => {
        throw new Error("Legacy SSH environment configuration is unavailable");
      },
    );
    assert.equal(throwing.kind, "local");
    assert.equal(throwing.workFolder, defaultWorkFolder("workspace-three"));
  });
});

test("an explicit local work host wins over the environment SSH box", async () => {
  await withLegacySSHEnv({ SSH_HOST: "172.26.249.177", SSH_USERNAME: "root" }, async () => {
    const target = await resolveWorkHostRecords(
      { workspaceId: "workspace-four" },
      {
        workspaceId: "workspace-four",
        workHost: { kind: "local", workFolder: "/tmp/explicit local" },
      },
      async () => {
        throw new Error("an explicit local choice must not resolve an SSH profile");
      },
    );
    assert.equal(target.kind, "local");
    assert.equal(target.workFolder, "/tmp/explicit local");
  });
});

test("work folder validation and quoting preserve spaces and remote home expansion", () => {
  assert.equal(validateWorkFolder("~/client work/"), "~/client work");
  assert.equal(shellFolderExpression("~/client work"), '"$HOME"/\'client work\'');
  assert.equal(shellFolderExpression("/tmp/a'b"), "'/tmp/a'\\''b'");
  assert.throws(() => validateWorkFolder("relative/path"), /absolute path/);
  assert.throws(() => validateWorkFolder("/tmp/a\ncmd"), /invalid/);
});

test("local work host creates and writes inside the selected folder", { skip: needsPosixShell }, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pc-work-host-"));
  const folder = path.join(root, "folder with spaces");
  try {
    const result = await testWorkHost({ workspaceId: "w", kind: "local", workFolder: folder });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, folder);
    assert.equal(fs.existsSync(path.join(folder, ".pentest-copilot-write-test")), false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("workspace command transport anchors relative files in workFolder", { skip: needsPosixShell }, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pc-workspace-exec-"));
  const folder = path.join(root, "workspace with spaces");
  const target = { workspaceId: "workspace-one", kind: "local" as const, workFolder: folder };
  try {
    const result = await execOnResolvedWorkHost(
      target,
      "mkdir -p ctf && printf synced > ctf/challenges.json && pwd",
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), folder);
    assert.equal(await fs.promises.readFile(path.join(folder, "ctf", "challenges.json"), "utf8"), "synced");
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("local directory browser returns folders only with canonical navigation paths", { skip: needsPosixShell }, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pc-directory-browser-"));
  try {
    await fs.promises.mkdir(path.join(root, "Alpha folder"));
    await fs.promises.mkdir(path.join(root, ".hidden"));
    await fs.promises.writeFile(path.join(root, "not-a-folder.txt"), "ignored");
    const listing = await listResolvedWorkHostDirectories(
      { workspaceId: "workspace-one", kind: "local", workFolder: root },
      root,
    );
    assert.equal(listing.currentPath, await fs.promises.realpath(root));
    assert.equal(listing.parentPath, path.dirname(await fs.promises.realpath(root)));
    assert.deepEqual(listing.directories.map((entry) => entry.name), [".hidden", "Alpha folder"]);
    assert.equal(listing.directories.some((entry) => entry.name === "not-a-folder.txt"), false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test("ShellManager runs local tool commands in the workspace folder", { skip: needsPosixShell }, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pc-shell-host-"));
  const folder = path.join(root, "workspace");
  const manager = new ShellManager("session-one", async () => ({
    workspaceId: "workspace-one",
    kind: "local",
    workFolder: folder,
  }));
  try {
    const result = await manager.execInShell("pwd");
    assert.equal(result.exitCode, 0);
    assert.equal(result.output.trim(), folder);
  } finally {
    await manager.destroy();
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { ShellManager, describeChannelOpenFailure } from "../src/services/shell.manager";

/**
 * Regression tests for "(SSH) Channel open failure: open failed".
 *
 * sshd counts every session channel of a single TCP connection — interactive
 * shells *and* `exec` commands — against `MaxSessions` (10 by default). An
 * aborted agent command used to leave its channel open until the remote
 * process exited on its own, so the budget ran out and the next shell spawn
 * was refused by sshd with that famously opaque message.
 *
 * The SSH client is faked here; no test touches a real sshd.
 */

class FakeChannel extends EventEmitter {
  stderr = new EventEmitter();
  written: string[] = [];
  destroyed = false;
  ended = false;

  write(data: string): boolean {
    this.written.push(data);
    return true;
  }

  end(): void {
    this.ended = true;
    this.emit("close");
  }

  destroy(): void {
    this.destroyed = true;
    this.ended = true;
    this.emit("close");
  }

  setWindow(): void {
    // no-op: only needed to satisfy the RuntimeChannel shape
  }
}

type ExecBehavior = (command: string, call: number) => FakeChannel | Error;

/** Minimal stand-in for an ssh2 Client: `exec(cmd, [opts], cb)`. */
class FakeSshClient {
  readonly commands: string[] = [];
  endCalls = 0;

  constructor(private readonly behavior: ExecBehavior) {}

  exec(command: string, argA?: unknown, argB?: unknown): this {
    const callback = (typeof argA === "function" ? argA : argB) as (
      err: Error | undefined,
      channel?: FakeChannel,
    ) => void;
    this.commands.push(command);
    const result = this.behavior(command, this.commands.length);
    // ssh2 always answers asynchronously.
    setImmediate(() => (result instanceof Error ? callback(result) : callback(undefined, result)));
    return this;
  }

  end(): void {
    this.endCalls += 1;
  }
}

const sshTarget = {
  workspaceId: "workspace-test",
  kind: "ssh" as const,
  workFolder: "~/pentest-workspaces/workspace-test",
  sshProfileAlias: "box-a",
  sshConfig: { host: "box-a", port: 22, username: "root" } as never,
};

interface ManagerInternals {
  connected: boolean;
  sshConnection: FakeSshClient;
  target: typeof sshTarget;
  execChannels: Set<unknown>;
}

function makeManager(client: FakeSshClient): ShellManager {
  const manager = new ShellManager("session-test", async () => sshTarget);
  const internals = manager as unknown as ManagerInternals;
  // Short-circuit connect(): the fake client replaces the real transport.
  internals.connected = true;
  internals.sshConnection = client;
  internals.target = sshTarget;
  return manager;
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition was not met in time");
    await delay(10);
  }
}

test("aborting a command destroys its remote channel instead of leaking it", async () => {
  const channel = new FakeChannel();
  const client = new FakeSshClient(() => channel);
  const manager = makeManager(client);
  const internals = manager as unknown as ManagerInternals;

  const controller = new AbortController();
  const pending = manager.execInShell("nmap -p- 10.0.0.1", 60_000, undefined, controller.signal);

  await waitFor(() => internals.execChannels.size === 1);
  await waitFor(() => client.commands.length === 1);
  assert.equal(manager.openChannelCount, 1, "the command channel counts against MaxSessions");

  controller.abort();
  const result = await pending;

  assert.equal(result.exitCode, 130);
  assert.match(result.output, /ABORTED/);
  assert.equal(channel.destroyed, true, "the remote command must be torn down, not orphaned");
  assert.equal(internals.execChannels.size, 0, "the channel must leave the bookkeeping set");
  assert.equal(manager.openChannelCount, 0);
});

test("a channel refused while another one closes is retried once", async () => {
  const channel = new FakeChannel();
  const client = new FakeSshClient((_cmd, call) =>
    call === 1 ? new Error("(SSH) Channel open failure: open failed") : channel,
  );
  const manager = makeManager(client);

  const shellId = await manager.spawnShell({ label: "shell-1" });

  assert.ok(shellId.startsWith("sh_"), `unexpected shell id: ${shellId}`);
  assert.equal(client.commands.length, 2, "the transient failure must be retried exactly once");
  assert.equal(manager.openChannelCount, 1);
});

test("a permanently refused channel explains the sshd session limit", async () => {
  const client = new FakeSshClient(() => new Error("(SSH) Channel open failure: open failed"));
  const manager = makeManager(client);

  await assert.rejects(
    () => manager.spawnShell({ label: "shell-1" }),
    (err: Error) => {
      assert.match(err.message, /MaxSessions/, `not actionable: ${err.message}`);
      assert.match(err.message, /Channel open failure/);
      return true;
    },
  );
  assert.equal(client.commands.length, 2, "stop after a single retry");
  assert.equal(manager.getShellList().length, 0, "a refused shell must not linger as a tab");
});

test(
  "shell spawns stop at the per-session budget before sshd refuses them",
  {
    skip:
      process.env.SSH_MAX_SHELLS_PER_SESSION === "0"
        ? "budget check disabled via SSH_MAX_SHELLS_PER_SESSION=0"
        : false,
  },
  async () => {
    const client = new FakeSshClient(() => new FakeChannel());
    const manager = makeManager(client);

    const opened: string[] = [];
    let refusal: Error | null = null;
    for (let i = 0; i < 12; i++) {
      try {
        opened.push(await manager.spawnShell({ label: `shell-${i + 1}` }));
      } catch (err: any) {
        refusal = err;
        break;
      }
    }

    assert.ok(refusal, "the pre-flight budget must refuse eventually");
    assert.match(refusal.message, /limit/);
    assert.match(refusal.message, /SSH_MAX_SHELLS_PER_SESSION/);
    assert.equal(opened.length, manager.openChannelCount);
    assert.ok(opened.length < 12, "the app must not exhaust the sshd channel budget by itself");
  },
);

test("describeChannelOpenFailure keeps sshd's wording but adds the remedy", () => {
  const message = describeChannelOpenFailure("(SSH) Channel open failure: open failed", 10, 8);
  assert.match(message, /Channel open failure: open failed/);
  assert.match(message, /MaxSessions/);
  assert.match(message, /10 channel\(s\) are currently open/);
  assert.match(message, /sshd_config/);
});

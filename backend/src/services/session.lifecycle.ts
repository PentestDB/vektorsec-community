import { ShellManager } from "./shell.manager";
import SessionsModel from "../models/Sessions/Sessions.model";
import { resolveSessionWorkHost } from "./work-host.service";

class SessionLifecycleManager {
  private shellManagers: Map<string, ShellManager> = new Map();
  private destroyTimers: Map<string, NodeJS.Timeout> = new Map();
  /** Last time anything touched the session (manager lookup, shell I/O). */
  private lastActivityAt: Map<string, number> = new Map();
  /** Injected by the shell socket layer: live ws clients per session. */
  private activeClientCount: (sessionId: string) => number = () => 0;
  private sweepTimer: NodeJS.Timeout | null = null;
  private static IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle before cleanup
  private static SWEEP_INTERVAL_MS = 5 * 60 * 1000; // how often to look for idle sessions

  async getShellManager(sessionId: string): Promise<ShellManager> {
    this.cancelDestroyTimer(sessionId);
    this.lastActivityAt.set(sessionId, Date.now());

    let mgr = this.shellManagers.get(sessionId);
    if (mgr) return mgr;

    mgr = new ShellManager(sessionId, () => resolveSessionWorkHost(sessionId));
    this.shellManagers.set(sessionId, mgr);

    mgr.on("connection_status", async (status: { sshConnected: boolean; hostConnected?: boolean; kind?: "local" | "ssh"; error?: string }) => {
      try {
        await SessionsModel.updateOne(
          { sessionId },
          {
            $set: {
              "connectionState.sshConnected": status.sshConnected,
              "connectionState.hostConnected": status.hostConnected ?? status.sshConnected,
              ...(status.kind ? { "connectionState.hostKind": status.kind } : {}),
              ...(status.hostConnected || status.sshConnected ? { "connectionState.lastConnectedAt": new Date() } : {}),
              ...(status.error ? { "connectionState.lastError": status.error } : {}),
            },
          },
        );
      } catch (err) {
        console.error(`[SessionLifecycle] Failed to update connection state for ${sessionId}:`, err);
      }
    });

    mgr.on("shell_created", async (info: { shellId: string; label: string; type: string; createdBy: string; subagentId?: string }) => {
      try {
        await SessionsModel.updateOne(
          { sessionId },
          {
            $push: {
              shells: {
                shellId: info.shellId,
                label: info.label,
                type: info.type,
                status: "active",
                createdBy: info.createdBy,
                subagentId: info.subagentId,
                createdAt: new Date(),
              },
            },
          },
        );
      } catch (err) {
        console.error(`[SessionLifecycle] Failed to persist shell creation for ${sessionId}:`, err);
      }
    });

    mgr.on("shell_closed", async (info: { shellId: string }) => {
      try {
        await SessionsModel.updateOne(
          { sessionId, "shells.shellId": info.shellId },
          {
            $set: {
              "shells.$.status": "closed",
              "shells.$.closedAt": new Date(),
            },
          },
        );
      } catch (err) {
        console.error(`[SessionLifecycle] Failed to persist shell closure for ${sessionId}:`, err);
      }
    });

    return mgr;
  }

  hasShellManager(sessionId: string): boolean {
    return this.shellManagers.has(sessionId);
  }

  /**
   * Register the provider that tells the sweep how many live websocket clients a
   * session has. A session someone is looking at is not "idle", even when the
   * user has not typed anything for a while.
   */
  setActiveClientCounter(counter: (sessionId: string) => number): void {
    this.activeClientCount = counter;
  }

  /** Mark the session as used right now, postponing any pending idle teardown. */
  touch(sessionId: string): void {
    this.lastActivityAt.set(sessionId, Date.now());
    this.cancelDestroyTimer(sessionId);
  }

  scheduleDestroy(
    sessionId: string,
    delayMs: number = SessionLifecycleManager.IDLE_TIMEOUT_MS,
  ): void {
    if (!this.shellManagers.has(sessionId)) return;
    this.cancelDestroyTimer(sessionId);
    const timer = setTimeout(() => {
      this.destroyTimers.delete(sessionId);
      this.destroy(sessionId).catch((err) =>
        console.error(`[SessionLifecycle] Error destroying session ${sessionId}:`, err),
      );
    }, delayMs);
    // Never keep the event loop alive just for an idle-teardown timer.
    timer.unref?.();
    this.destroyTimers.set(sessionId, timer);
  }

  private cancelDestroyTimer(sessionId: string): void {
    const timer = this.destroyTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.destroyTimers.delete(sessionId);
    }
  }

  async destroy(sessionId: string): Promise<void> {
    this.cancelDestroyTimer(sessionId);
    this.lastActivityAt.delete(sessionId);
    const mgr = this.shellManagers.get(sessionId);
    if (mgr) {
      await mgr.destroy();
      this.shellManagers.delete(sessionId);
      console.log(`[SessionLifecycle] Destroyed session ${sessionId}`);
    }
  }

  /**
   * Destroy every in-memory manager whose session has been idle for longer than
   * `idleMs`. Covers leaks that never emit a ws close (crashed clients, gateway
   * restarts, redis-less deployments) and therefore never get a timer.
   */
  async sweepIdleSessions(
    idleMs: number = SessionLifecycleManager.IDLE_TIMEOUT_MS,
    now: number = Date.now(),
  ): Promise<string[]> {
    const destroyed: string[] = [];
    for (const sessionId of Array.from(this.shellManagers.keys())) {
      // A tab that is still open keeps its shells alive.
      if (this.activeClientCount(sessionId) > 0) continue;
      const last = this.lastActivityAt.get(sessionId);
      if (last !== undefined && now - last < idleMs) continue;
      try {
        await this.destroy(sessionId);
        destroyed.push(sessionId);
      } catch (err) {
        console.error(`[SessionLifecycle] Idle sweep failed for ${sessionId}:`, err);
      }
    }
    if (destroyed.length > 0) {
      console.log(`[SessionLifecycle] Idle sweep destroyed ${destroyed.length} session(s)`);
    }
    return destroyed;
  }

  /** Start the periodic idle sweep (idempotent). */
  startIdleSweep(intervalMs: number = SessionLifecycleManager.SWEEP_INTERVAL_MS): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      this.sweepIdleSessions().catch((err) =>
        console.error("[SessionLifecycle] Idle sweep error:", err),
      );
    }, intervalMs);
    this.sweepTimer.unref?.();
  }

  stopIdleSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  async destroyAll(): Promise<void> {
    for (const [sessionId] of this.shellManagers) {
      await this.destroy(sessionId);
    }
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.shellManagers.keys());
  }
}

export const sessionLifecycle = new SessionLifecycleManager();

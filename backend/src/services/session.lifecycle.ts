import { ShellManager } from "./shell.manager";
import SessionsModel from "../models/Sessions/Sessions.model";
import { resolveSessionWorkHost } from "./work-host.service";

class SessionLifecycleManager {
  private shellManagers: Map<string, ShellManager> = new Map();
  private destroyTimers: Map<string, NodeJS.Timeout> = new Map();
  private static IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle before cleanup

  async getShellManager(sessionId: string): Promise<ShellManager> {
    this.cancelDestroyTimer(sessionId);

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

  scheduleDestroy(sessionId: string): void {
    this.cancelDestroyTimer(sessionId);
    const timer = setTimeout(() => {
      this.destroy(sessionId).catch((err) =>
        console.error(`[SessionLifecycle] Error destroying session ${sessionId}:`, err),
      );
    }, SessionLifecycleManager.IDLE_TIMEOUT_MS);
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
    const mgr = this.shellManagers.get(sessionId);
    if (mgr) {
      await mgr.destroy();
      this.shellManagers.delete(sessionId);
      console.log(`[SessionLifecycle] Destroyed session ${sessionId}`);
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

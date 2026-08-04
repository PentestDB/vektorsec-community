import { Router, Request, Response } from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { sessionLifecycle } from "../services/session.lifecycle";
import { requireActiveSession } from "../services/session.helpers";
import SessionsModel from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import { execSSHCommand } from "../services/ssh.service";
import {
  listSSHProfiles,
  resolveSSHProfile,
  testSSHProfile,
} from "../services/ssh-profile.service";
import { defaultWorkFolder } from "../services/work-host.service";

const router = Router();

router.use(verifySess);

const SSH_TEST_TIMEOUT_MS = 5000;

router.post("/test-ssh", async (_req: Request, res: Response) => {
  try {
    const whoami = await execSSHCommand("whoami", SSH_TEST_TIMEOUT_MS);
    return res.status(200).json({
      success: true,
      message: `SSH connected as ${whoami.trim()}`,
    });
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      message: err.message || "SSH connection failed",
    });
  }
});

router.get("/:sessionId/ssh-profiles", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const workspace = await WorkspaceModel.findOne({ workspaceId: session.workspaceId, uid: userId }).lean();
    const profiles = await listSSHProfiles();
    return res.status(200).json({
      profiles,
      selectedAlias: workspace?.workHost?.kind === "ssh" ? workspace.workHost.sshProfileAlias ?? null : null,
      connectionState: session.connectionState ?? { sshConnected: false, hostConnected: false },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to discover SSH profiles" });
  }
});

router.post("/:sessionId/ssh-profile/test", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const profileAlias = String(
      req.body?.profileAlias || "",
    ).trim();
    if (!profileAlias) {
      return res.status(400).json({ message: "Select an SSH profile first" });
    }
    const profile = await testSSHProfile(profileAlias);
    return res.status(200).json({ success: true, profile });
  } catch (err: any) {
    return res.status(200).json({
      success: false,
      message: err.message || "SSH connection failed",
    });
  }
});

router.put("/:sessionId/ssh-profile", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const profileAlias = String(req.body?.profileAlias || "").trim();
    if (!profileAlias) {
      return res.status(400).json({ message: "profileAlias is required" });
    }
    const resolved = await resolveSSHProfile(profileAlias);
    if (!resolved.summary.available) {
      return res.status(400).json({ message: resolved.summary.error || "SSH profile is unavailable" });
    }

    await WorkspaceModel.updateOne(
      { workspaceId: session.workspaceId, uid: userId, status: "active" },
      { $set: { workHost: {
        kind: "ssh",
        workFolder: req.body?.workFolder || defaultWorkFolder(session.workspaceId),
        sshProfileAlias: profileAlias,
        configuredAt: new Date(),
      } } },
    );
    session.connectionState = { sshConnected: false, hostConnected: false };
    await session.save();

    await sessionLifecycle.destroy(sessionId);
    const manager = await sessionLifecycle.getShellManager(sessionId);
    try {
      await manager.connect();
      return res.status(200).json({
        message: `Connected with ${profileAlias}`,
        profile: resolved.summary,
        sshConnected: true,
      });
    } catch (error: any) {
      return res.status(200).json({
        message: error?.message || "Profile saved, but SSH connection failed",
        profile: resolved.summary,
        sshConnected: false,
      });
    }
  } catch (err: any) {
    return res.status(400).json({ message: err.message || "Failed to save SSH profile" });
  }
});

router.delete("/:sessionId/ssh-profile", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    await sessionLifecycle.destroy(sessionId);
    await WorkspaceModel.updateOne(
      { workspaceId: session.workspaceId, uid: userId, status: "active" },
      { $set: { workHost: {
        kind: "local",
        workFolder: defaultWorkFolder(session.workspaceId),
        configuredAt: new Date(),
      } } },
    );
    session.connectionState = { sshConnected: false, hostConnected: false };
    await session.save();
    return res.status(200).json({ message: "SSH profile disconnected" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to disconnect SSH profile" });
  }
});

router.get("/:sessionId/list", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (sessionLifecycle.hasShellManager(sessionId)) {
      const mgr = await sessionLifecycle.getShellManager(sessionId);
      return res.status(200).json({ shells: mgr.getShellList() });
    }

    return res.status(200).json({ shells: session.shells ?? [] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/:sessionId/:shellId/buffer", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, shellId } = req.params;
    const fromOffset = req.query.fromOffset ? parseInt(req.query.fromOffset as string, 10) : undefined;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const mgr = await sessionLifecycle.getShellManager(sessionId);
    const { data, offset } = mgr.readOutput(shellId, fromOffset);
    return res.status(200).json({ data, offset });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/:sessionId/spawn", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;
    const { label } = req.body;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (!label) {
      return res.status(400).json({ message: "label is required" });
    }

    const mgr = await sessionLifecycle.getShellManager(sessionId);
    if (!mgr.isConnected) {
      await mgr.connect();
    }

    const shellId = await mgr.spawnShell({ label, type: "pty", createdBy: "user" });
    return res.status(200).json({ shellId, label });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.delete("/:sessionId/:shellId", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId, shellId } = req.params;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const mgr = await sessionLifecycle.getShellManager(sessionId);
    await mgr.closeShell(shellId);
    return res.status(200).json({ message: "Shell closed" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.get("/:sessionId/connection", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    if (sessionLifecycle.hasShellManager(sessionId)) {
      const mgr = await sessionLifecycle.getShellManager(sessionId);
      const state = session.connectionState ?? {};
      return res.status(200).json({
        ...state,
        sshConnected: mgr.isConnected,
      });
    }

    return res.status(200).json(session.connectionState ?? { sshConnected: false });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/:sessionId/reconnect", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const mgr = await sessionLifecycle.getShellManager(sessionId);
    await mgr.reconnect();
    return res.status(200).json({ message: "Reconnected", sshConnected: true });
  } catch (err: any) {
    return res.status(500).json({ message: `Reconnect failed: ${err.message}` });
  }
});

router.get("/:sessionId/subagents", async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { sessionId } = req.params;

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const subagents = (session.subagents ?? []).map((s) => ({
      subagentId: s.subagentId,
      parentId: s.parentId,
      task: s.task,
      status: s.status,
      result: s.result,
      shells: s.shells,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
      messageCount: s.messages?.length ?? 0,
    }));

    return res.status(200).json({ subagents });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export const shellRoutes = router;

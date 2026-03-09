import { Router, Request, Response } from "express";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { sessionLifecycle } from "../services/session.lifecycle";
import { requireActiveSession } from "../services/session.helpers";
import SessionsModel from "../models/Sessions/Sessions.model";

const router = Router();

router.use(verifySess);

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
    await mgr.connect();
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

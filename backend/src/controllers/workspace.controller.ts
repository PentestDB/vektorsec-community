import { Response, Request } from "express";
import { v4 as uuidv4 } from "uuid";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { listSSHProfiles } from "../services/ssh-profile.service";
import { sessionLifecycle } from "../services/session.lifecycle";
import {
  defaultWorkFolder,
  listResolvedWorkHostDirectories,
  normalizeWorkHost,
  resolveWorkspaceWorkHost,
  testWorkHost,
} from "../services/work-host.service";
import {
  DEFAULT_WORKSPACE_MAX_TURNS,
  WORKSPACE_MAX_TURNS_CHOICES,
  normalizeWorkspaceMaxTurns,
} from "../utils/agentConfig";

export const createWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { name, description, type } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Workspace name is required" });
    }

    const workspaceId = uuidv4();

    const workspace = new WorkspaceModel({
      uid: userId,
      workspaceId,
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description: description?.substring(0, 500) ?? "",
      type: type || "general",
      createdAt: new Date(),
    });
    await workspace.save();

    return res.status(200).json({ workspaceId, message: "Workspace created" });
  } catch (err: any) {
    console.error("[workspace] createWorkspace error:", err);
    return res.status(400).json({ message: "Failed to create workspace" });
  }
};

export const getUserWorkspaces = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;

    const workspaces = await WorkspaceModel.find({
      uid: user._id,
      status: { $ne: "archived" },
    })
      .select("workspaceId name description type createdAt workHost")
      .sort({ createdAt: -1 })
      .lean();

    const workspaceIds = workspaces.map((w) => w.workspaceId);

    const sessionAggregation = await SessionsModel.aggregate([
      {
        $match: {
          workspaceId: { $in: workspaceIds },
          status: { $ne: "archived" },
        },
      },
      {
        $group: {
          _id: "$workspaceId",
          totalSessions: { $sum: 1 },
          runningSessions: {
            $sum: { $cond: [{ $eq: ["$agentState", "running"] }, 1, 0] },
          },
          idleSessions: {
            $sum: { $cond: [{ $eq: ["$agentState", "idle"] }, 1, 0] },
          },
          waitingSessions: {
            $sum: {
              $cond: [
                { $in: ["$agentState", ["waiting_consent", "waiting_manual_execution", "paused"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const sessionMap = new Map(
      sessionAggregation.map((s) => [s._id, s]),
    );

    const result = workspaces.map((w) => {
      const stats = sessionMap.get(w.workspaceId);
      return {
        ...w,
        sessions: {
          total: stats?.totalSessions ?? 0,
          running: stats?.runningSessions ?? 0,
          idle: stats?.idleSessions ?? 0,
          waiting: stats?.waitingSessions ?? 0,
        },
      };
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[workspace] getUserWorkspaces error:", err);
    return res.status(400).json({ message: "Failed to get workspaces" });
  }
};

export const getWorkspaceDetail = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    }).lean();

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const sessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    })
      .select("sessionId name description createdAt agentState totalTokens")
      .sort({ createdAt: -1 })
      .lean();

    const ctfInfo = workspace.ctfConfig
      ? {
          connected: true,
          url: workspace.ctfConfig.url,
          ctfName: workspace.ctfConfig.ctfName,
          authMethod: workspace.ctfConfig.authMethod,
          lastSynced: workspace.ctfConfig.lastSynced || null,
          flagFormat: workspace.ctfConfig.flagFormat || null,
        }
      : { connected: false };

    return res.status(200).json({
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      description: workspace.description,
      type: workspace.type,
      createdAt: workspace.createdAt,
      ctf: ctfInfo,
      workHost: workspace.workHost || {
        kind: "local",
        workFolder: defaultWorkFolder(workspace.workspaceId),
      },
      // Per-workspace agent settings (Workspace Settings → Agent).
      agentConfig: workspace.agentConfig ?? {},
      agentTurnLimitChoices: WORKSPACE_MAX_TURNS_CHOICES,
      defaultAgentMaxTurns: DEFAULT_WORKSPACE_MAX_TURNS,
      sessions,
    });
  } catch (err: any) {
    console.error("[workspace] getWorkspaceDetail error:", err);
    return res.status(400).json({ message: "Failed to get workspace details" });
  }
};

/**
 * GET /workspace/:workspaceId/agent-config
 * Returns the per-workspace agent settings (currently just maxTurns).
 */
export const getWorkspaceAgentConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    })
      .select("workspaceId agentConfig")
      .lean();

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const maxTurns = normalizeWorkspaceMaxTurns(workspace.agentConfig?.maxTurns);

    return res.status(200).json({
      workspaceId,
      maxTurns: maxTurns ?? null, // null = unset → fall back to user-level setting
      autonomousMode: workspace.agentConfig?.autonomousMode === true,
      scope: workspace.agentConfig?.scope ?? {
        enabled: false,
        strictMode: false,
        entriesRaw: "",
      },
      choices: WORKSPACE_MAX_TURNS_CHOICES,
      defaultMaxTurns: DEFAULT_WORKSPACE_MAX_TURNS,
    });
  } catch (err: any) {
    console.error("[workspace] getWorkspaceAgentConfig error:", err);
    return res.status(400).json({ message: "Failed to load workspace agent settings" });
  }
};

/**
 * PUT /workspace/:workspaceId/agent-config
 * Body: { maxTurns?, autonomousMode?, scope? }
 *   maxTurns      – one of WORKSPACE_MAX_TURNS_CHOICES, or null to clear
 *   autonomousMode– boolean: allow high-risk in-scope actions without consent
 *   scope         – { enabled, strictMode, entriesRaw } workspace allowlist
 */
export const updateWorkspaceAgentConfig = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const rawMaxTurns = req.body?.maxTurns;
    const rawAutonomous = req.body?.autonomousMode;
    const rawScope = req.body?.scope;

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    if (!workspace.agentConfig) workspace.agentConfig = {};

    // maxTurns
    if (rawMaxTurns === undefined || rawMaxTurns === null || rawMaxTurns === "") {
      workspace.agentConfig.maxTurns = undefined;
    } else {
      const maxTurns = normalizeWorkspaceMaxTurns(rawMaxTurns);
      if (maxTurns === undefined) {
        return res.status(400).json({
          message: `maxTurns must be one of: ${WORKSPACE_MAX_TURNS_CHOICES.join(", ")}`,
        });
      }
      workspace.agentConfig.maxTurns = maxTurns;
    }

    // autonomousMode
    if (rawAutonomous !== undefined) {
      if (typeof rawAutonomous !== "boolean") {
        return res.status(400).json({ message: "autonomousMode must be a boolean" });
      }
      workspace.agentConfig.autonomousMode = rawAutonomous;
    }

    // scope
    if (rawScope !== undefined) {
      if (typeof rawScope !== "object" || rawScope === null) {
        return res.status(400).json({ message: "scope must be an object" });
      }
      const enabled = rawScope.enabled ?? workspace.agentConfig.scope?.enabled ?? false;
      const strictMode = rawScope.strictMode ?? workspace.agentConfig.scope?.strictMode ?? false;
      const entriesRaw = rawScope.entriesRaw ?? workspace.agentConfig.scope?.entriesRaw ?? "";
      if (typeof enabled !== "boolean" || typeof strictMode !== "boolean" || typeof entriesRaw !== "string") {
        return res.status(400).json({ message: "scope.{enabled,strictMode,entriesRaw} are invalid" });
      }
      workspace.agentConfig.scope = { enabled, strictMode, entriesRaw };
    }

    await workspace.save();

    return res.status(200).json({
      workspaceId,
      maxTurns: workspace.agentConfig?.maxTurns ?? null,
      autonomousMode: workspace.agentConfig?.autonomousMode === true,
      scope: workspace.agentConfig?.scope ?? {
        enabled: false,
        strictMode: false,
        entriesRaw: "",
      },
      choices: WORKSPACE_MAX_TURNS_CHOICES,
      defaultMaxTurns: DEFAULT_WORKSPACE_MAX_TURNS,
      message: "Workspace agent settings updated",
    });
  } catch (err: any) {
    console.error("[workspace] updateWorkspaceAgentConfig error:", err);
    return res.status(400).json({ message: "Failed to update workspace agent settings" });
  }
};

export const getWorkspaceWorkHost = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId, status: "active" })
      .select("workspaceId workHost")
      .lean();
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const workHost = workspace.workHost || {
      kind: "local",
      workFolder: defaultWorkFolder(workspaceId),
    };
    return res.status(200).json({
      workHost,
      profiles: await listSSHProfiles(),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Failed to load work host" });
  }
};

export const updateWorkspaceWorkHost = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId, status: "active" });
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const normalized = await normalizeWorkHost(workspaceId, req.body || {});
    workspace.workHost = { ...normalized, configuredAt: new Date() };
    await workspace.save();

    // Existing sessions inherit workspace configuration. Drop their transports
    // so the next operation reconnects on the newly selected host/folder.
    const sessions = await SessionsModel.find({ workspaceId, status: "active" })
      .select("sessionId")
      .lean();
    await Promise.all(sessions.map((session) => sessionLifecycle.destroy(session.sessionId)));

    return res.status(200).json({ message: "Work host saved", workHost: workspace.workHost });
  } catch (err: any) {
    return res.status(400).json({ message: err.message || "Failed to save work host" });
  }
};

export const testWorkspaceWorkHost = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId, status: "active" })
      .select("workspaceId")
      .lean();
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const target: Awaited<ReturnType<typeof resolveWorkspaceWorkHost>> = req.body?.kind
      ? await (async () => {
          const input = await normalizeWorkHost(workspaceId, req.body);
          if (input.kind === "local") return { workspaceId, ...input };
          const { resolveSSHProfile } = await import("../services/ssh-profile.service");
          const profile = await resolveSSHProfile(input.sshProfileAlias!);
          return {
            workspaceId,
            ...input,
            sshConfig: profile.config,
            sshProfile: profile.summary,
          };
        })()
      : await resolveWorkspaceWorkHost(workspaceId);
    const result = await testWorkHost(target);
    if (result.code !== 0) {
      return res.status(200).json({ success: false, message: result.stderr || "Host test failed" });
    }
    return res.status(200).json({
      success: true,
      kind: target.kind,
      workFolder: result.stdout.trim() || target.workFolder,
      profile: target.sshProfile,
    });
  } catch (err: any) {
    return res.status(200).json({ success: false, message: err.message || "Host test failed" });
  }
};

export const listWorkspaceWorkHostDirectories = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const workspace = await WorkspaceModel.findOne({ workspaceId, uid: userId, status: "active" })
      .select("workspaceId")
      .lean();
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const input = await normalizeWorkHost(workspaceId, {
      ...(req.body?.workHost || {}),
      workFolder: req.body?.path || req.body?.workHost?.workFolder || "~",
    });
    const target: Awaited<ReturnType<typeof resolveWorkspaceWorkHost>> = input.kind === "local"
      ? { workspaceId, ...input }
      : await (async () => {
          const { resolveSSHProfile } = await import("../services/ssh-profile.service");
          const profile = await resolveSSHProfile(input.sshProfileAlias!);
          return {
            workspaceId,
            ...input,
            sshConfig: profile.config,
            sshProfile: profile.summary,
          };
        })();

    return res.status(200).json(
      await listResolvedWorkHostDirectories(target, req.body?.path || "~"),
    );
  } catch (err: any) {
    return res.status(400).json({ message: err.message || "Failed to list directories" });
  }
};

export const deleteWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    workspace.status = "archived";
    await workspace.save();

    await SessionsModel.updateMany(
      { workspaceId, uid: userId, status: "active" },
      { $set: { status: "archived" } },
    );

    return res.status(200).json({ message: "Workspace deleted" });
  } catch (err: any) {
    console.error("[workspace] deleteWorkspace error:", err);
    return res.status(400).json({ message: "Failed to delete workspace" });
  }
};

export const createSessionInWorkspace = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;
    const { name, description } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    if (!name) {
      return res.status(400).json({ message: "Session name is required" });
    }

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    });

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const sessionId = uuidv4();

    const archiveHistory = new HistoryArchiveModel({
      sessionId,
      history: [],
    });
    await archiveHistory.save();

    const session = new SessionsModel({
      uid: userId,
      sessionId,
      workspaceId,
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description: description?.substring(0, 500) ?? "",
      createdAt: new Date(),
    });

    if (workspace.type === "ctf" && workspace.ctfConfig) {
      session.ctfConfig = workspace.ctfConfig;
    }

    await session.save();

    return res.status(200).json({
      sessionId,
      workspaceId,
      message: "Session created",
    });
  } catch (err: any) {
    console.error("[workspace] createSessionInWorkspace error:", err);
    return res.status(400).json({ message: "Failed to create session" });
  }
};

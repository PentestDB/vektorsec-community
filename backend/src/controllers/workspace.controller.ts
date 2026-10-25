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
import { getEvidenceCollector } from "../tools/handlers/collect-evidence";
import { ReportGenerator } from "../services/evidenceCollector";
import { logAuditFromRequest } from "../services/audit.service";
import {
  buildExecutiveSummary,
  buildRecommendations,
  compactEvidence,
  parseReportFormat,
  reportContentType,
  reportFileName,
  sortFindingsBySeverity,
  toReportFinding,
} from "../utils/report";

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
 * GET /workspace/:workspaceId/overview
 *
 * Read-only aggregation of a workspace's engagement state for the Pentest
 * cockpit: session activity, findings rolled up from every active session,
 * discovered targets (target memory) and attack-chain progress. Nothing here
 * touches the network, SSH or the agent runtime — it is a projection of what is
 * already persisted so the workspace page can show the engagement at a glance.
 */
export const getWorkspaceOverview = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    })
      .select("workspaceId name type agentConfig workHost")
      .lean();

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const sessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    })
      .select(
        "sessionId name agentState totalTokens vulnerabilities targetMemory attackChain",
      )
      .lean();

    const sessionStats = { total: sessions.length, running: 0, idle: 0, waiting: 0, tokens: 0 };

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const byStatus = { open: 0, confirmed: 0, remediated: 0, accepted: 0 };
    const findings: any[] = [];
    let exploited = 0;

    const targetMap = new Map<string, { target: string; entries: number; dataTypes: Set<string> }>();
    const chainByStatus = { pending: 0, running: 0, success: 0, failed: 0, skipped: 0 };
    const chainPhases = new Set<string>();
    let chainSteps = 0;

    for (const session of sessions) {
      const state = session.agentState;
      if (state === "running") sessionStats.running += 1;
      else if (state === "idle") sessionStats.idle += 1;
      else if (
        state === "waiting_consent" ||
        state === "waiting_manual_execution" ||
        state === "paused"
      ) {
        sessionStats.waiting += 1;
      }
      sessionStats.tokens += session.totalTokens || 0;

      for (const vuln of session.vulnerabilities ?? []) {
        const severity = (vuln.severity ?? "info") as keyof typeof bySeverity;
        if (bySeverity[severity] !== undefined) bySeverity[severity] += 1;
        const status = (vuln.status ?? "open") as keyof typeof byStatus;
        if (byStatus[status] !== undefined) byStatus[status] += 1;
        if (vuln.exploited) exploited += 1;

        findings.push({
          vulnerabilityId: vuln.vulnerabilityId,
          sessionId: session.sessionId,
          sessionName: session.name,
          title: vuln.title,
          host: vuln.host,
          service: vuln.service ?? null,
          endpoint: vuln.endpoint ?? null,
          severity: vuln.severity ?? "info",
          cvssScore: vuln.cvssScore ?? null,
          cve: vuln.cve ?? null,
          cwe: vuln.cwe ?? null,
          status: vuln.status ?? "open",
          exploited: vuln.exploited === true,
          updatedAt: vuln.updatedAt,
        });
      }

      for (const entry of session.targetMemory ?? []) {
        if (!entry?.target) continue;
        const existing = targetMap.get(entry.target);
        if (existing) {
          existing.entries += 1;
          if (entry.dataType) existing.dataTypes.add(entry.dataType);
        } else {
          targetMap.set(entry.target, {
            target: entry.target,
            entries: 1,
            dataTypes: new Set(entry.dataType ? [entry.dataType] : []),
          });
        }
      }

      const chain = session.attackChain;
      if (chain) {
        if (chain.currentPhase) chainPhases.add(chain.currentPhase);
        for (const step of chain.steps ?? []) {
          chainSteps += 1;
          const stepStatus = (step.status ?? "pending") as keyof typeof chainByStatus;
          if (chainByStatus[stepStatus] !== undefined) chainByStatus[stepStatus] += 1;
        }
      }
    }

    const severityRank: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
    findings.sort((a, b) => {
      const delta = (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0);
      if (delta !== 0) return delta;
      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    });

    const targets = Array.from(targetMap.values())
      .map((t) => ({ target: t.target, entries: t.entries, dataTypes: Array.from(t.dataTypes) }))
      .sort((a, b) => b.entries - a.entries);

    const scopeRaw = workspace.agentConfig?.scope?.entriesRaw ?? "";
    const scopeEntries = scopeRaw
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    return res.status(200).json({
      workspaceId,
      generatedAt: new Date().toISOString(),
      sessions: sessionStats,
      vulnerabilities: {
        total: findings.length,
        exploited,
        bySeverity,
        byStatus,
        findings,
      },
      targets,
      attackChain: {
        steps: chainSteps,
        byStatus: chainByStatus,
        phases: Array.from(chainPhases),
      },
      scope: {
        enabled: workspace.agentConfig?.scope?.enabled === true,
        strictMode: workspace.agentConfig?.scope?.strictMode === true,
        entryCount: scopeEntries.length,
        entries: scopeEntries,
      },
      workHost: workspace.workHost || null,
    });
  } catch (err: any) {
    console.error("[workspace] getWorkspaceOverview error:", err);
    return res.status(400).json({ message: "Failed to load workspace overview" });
  }
};

/**
 * GET /workspace/:workspaceId/report?format=markdown|html|json[&inline=1]
 *
 * Engagement-level deliverable for the whole workspace: findings are merged
 * from every active session (severity sorted), the evidence the agents
 * collected during those sessions is attached and the workspace scope is
 * stamped on the document. It reuses the exact pipeline of the per-session
 * export (`GET /api/agent/session/:id/report`) so both documents stay
 * consistent — same evidence collector, same renderer, same helpers.
 */
export const exportWorkspaceReport = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { workspaceId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ message: "workspaceId is required" });
    }

    const format = parseReportFormat(req.query.format);
    if (!format) {
      return res.status(400).json({ message: "format must be markdown, html or json" });
    }

    const workspace = await WorkspaceModel.findOne({
      workspaceId,
      uid: userId,
      status: "active",
    })
      .select("workspaceId name createdAt agentConfig")
      .lean();

    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const sessions = await SessionsModel.find({
      workspaceId,
      status: { $ne: "archived" },
    })
      .select("sessionId name createdAt vulnerabilities")
      .sort({ createdAt: 1 })
      .lean();

    const findings = sortFindingsBySeverity(
      sessions.flatMap((session) =>
        ((session.vulnerabilities ?? []) as any[]).map((vulnerability, index) =>
          toReportFinding(vulnerability, index),
        ),
      ),
    );

    const evidence = sessions.flatMap((session) =>
      compactEvidence(getEvidenceCollector(session.sessionId).getAll()),
    );

    const scopeEntries = (workspace.agentConfig?.scope?.entriesRaw ?? "")
      .split(/[\n,]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const scope = scopeEntries.slice(0, 20).join(", ");

    // Which sessions fed this report — an engagement report has to stay
    // traceable back to the runs it aggregates.
    const sessionNames = sessions
      .map((session) => session.name || session.sessionId)
      .filter(Boolean);
    const provenance = sessionNames.length
      ? ` Findings were aggregated from ${sessions.length} session(s): ${sessionNames
          .slice(0, 12)
          .join(", ")}${sessionNames.length > 12 ? ", …" : ""}.`
      : " No sessions have been recorded in this workspace yet.";

    const title = `${workspace.name || "Engagement"} — workspace report`;

    const generator = new ReportGenerator(workspaceId);
    const report = generator.generateReport({
      title,
      engagementDate: workspace.createdAt ?? new Date(),
      scope: scope || undefined,
      executiveSummary:
        buildExecutiveSummary({
          findings,
          scope: scope || undefined,
          evidenceCount: evidence.length,
        }) + provenance,
      methodology: [
        "Reconnaissance",
        "Enumeration",
        "Vulnerability Analysis",
        "Exploitation",
        "Post-Exploitation",
        "Reporting",
      ],
      findings,
      evidence,
      recommendations: buildRecommendations(findings),
    });

    const body =
      format === "html"
        ? generator.toHtml(report)
        : format === "json"
          ? JSON.stringify(report, null, 2)
          : generator.toMarkdown(report);

    res.setHeader("Content-Type", reportContentType(format));
    if (req.query.inline !== "1") {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${reportFileName({ title, format })}"`,
      );
    }
    return res.status(200).send(body);
  } catch (err: any) {
    console.error("[workspace] exportWorkspaceReport error:", err);
    return res.status(500).json({ message: err?.message || "Failed to export report" });
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

    // Credential-free view of the host this workspace's commands actually run
    // on: the saved choice when there is one, otherwise the resolved default
    // (which inherits the environment SSH box once one is configured, so the
    // Connection page reflects reality instead of always showing "Local").
    let workHost = workspace.workHost;
    if (!workHost) {
      try {
        const resolved = await resolveWorkspaceWorkHost(workspaceId);
        workHost = {
          kind: resolved.kind,
          workFolder: resolved.workFolder,
          ...(resolved.sshProfileAlias ? { sshProfileAlias: resolved.sshProfileAlias } : {}),
        } as typeof workspace.workHost;
      } catch {
        workHost = {
          kind: "local",
          workFolder: defaultWorkFolder(workspaceId),
        } as typeof workspace.workHost;
      }
    }
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

    const activeSessions = await SessionsModel.find({
      workspaceId,
      uid: userId,
      status: "active",
    })
      .select("sessionId")
      .lean();

    // Archiving the workspace must also kill the live shells of its sessions,
    // otherwise "deleted" engagements keep ssh tunnels/processes alive.
    for (const { sessionId } of activeSessions) {
      if (!sessionId) continue;
      try {
        await sessionLifecycle.destroy(sessionId);
      } catch (err) {
        console.error(`[workspace] failed to destroy shells for ${sessionId}:`, err);
      }
    }

    const archivedAt = new Date();

    workspace.status = "archived";
    await workspace.save();

    await SessionsModel.updateMany(
      { workspaceId, uid: userId, status: "active" },
      { $set: { status: "archived", archivedAt, agentState: "idle" } },
    );

    await logAuditFromRequest(req, res, "workspace.archived", {
      resourceType: "workspace",
      resourceId: workspaceId,
      details: {
        name: workspace.name,
        archivedSessions: activeSessions.length,
      },
    });

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

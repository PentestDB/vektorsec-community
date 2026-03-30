import { ToolDefinition, ToolResult, ExecutionContext } from "../types";
import { EngagementState } from "../../services/engagement-state";
import SessionsModel from "../../models/Sessions/Sessions.model";
import { sanitizeDirName, submitFlagToCtfd } from "../../services/ctf.service";

function str(v: any): string {
  return typeof v === "string" ? v.trim() : "";
}

function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

const updateEngagementState: ToolDefinition = {
  name: "update_engagement_state",
  description:
    "Record a structured finding to the persistent engagement state. This state is always visible in the system prompt and survives context summarization. Call after every significant discovery.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "add_host",
          "add_service",
          "add_credential",
          "add_vulnerability",
          "add_shell",
          "set_phase",
          "attempt_flag",
          "confirm_flag",
          "add_distfile_analysis",
          "add_key_discovery",
          "set_challenge_status",
          "add_file",
          "log_approach",
          "set_next_steps",
        ],
        description: "The type of state update to make.",
      },
      data: {
        type: "object",
        description:
          "The finding data. Shape depends on the action chosen.",
        additionalProperties: true,
      },
    },
    required: ["action", "data"],
  },
  requiresConsent: false,

  async execute(
    args: Record<string, any>,
    ctx: ExecutionContext,
  ): Promise<ToolResult> {
    const state = ctx.engagementState as EngagementState | undefined;
    if (!state) {
      return { output: "Engagement state not initialized.", exitCode: 1 };
    }

    const { action } = args;
    const data = args.data && typeof args.data === "object" ? args.data : {};

    switch (action) {
      // ─── Pentest actions ────────────────────────────────────────
      case "add_host":
        state.hosts.push({
          ip: data.ip ?? "unknown",
          hostname: data.hostname,
          os: data.os,
          status: data.status ?? "up",
        });
        return { output: `Host ${data.ip} added.`, exitCode: 0 };

      case "add_service":
        state.services.push({
          host: data.host ?? "unknown",
          port: data.port ?? 0,
          protocol: data.protocol ?? "tcp",
          service: data.service ?? "unknown",
          version: data.version,
          notes: data.notes,
        });
        return {
          output: `Service ${data.host}:${data.port} (${data.service}) added.`,
          exitCode: 0,
        };

      case "add_credential":
        state.credentials.push({
          username: data.username ?? "",
          secret: data.secret ?? "",
          secretType: data.secretType ?? "password",
          source: data.source ?? "unknown",
          validOn: data.validOn ?? [],
        });
        return {
          output: `Credential ${data.username} added.`,
          exitCode: 0,
        };

      case "add_vulnerability":
        if (!str(data.title)) {
          return { output: "add_vulnerability requires data.title", exitCode: 1 };
        }
        state.vulnerabilities.push({
          host: data.host ?? "unknown",
          service: data.service,
          title: data.title ?? "Untitled",
          severity: data.severity ?? "medium",
          evidence: data.evidence ?? "",
          exploited: data.exploited ?? false,
          cve: data.cve,
        });
        return {
          output: `Vulnerability "${data.title}" [${data.severity ?? "medium"}] added.`,
          exitCode: 0,
        };

      case "add_shell":
        state.shells.push({
          shellId: data.shellId ?? "unknown",
          host: data.host ?? "unknown",
          user: data.user ?? "unknown",
          privilegeLevel: data.privilegeLevel ?? "user",
          type: data.type ?? "ssh",
          obtainedVia: data.obtainedVia,
        });
        return {
          output: `Shell on ${data.host} as ${data.user} recorded.`,
          exitCode: 0,
        };

      case "set_phase":
        state.phase = data.phase ?? state.phase;
        return { output: `Phase set to: ${state.phase}`, exitCode: 0 };

      // ─── CTF actions ────────────────────────────────────────────
      case "attempt_flag": {
        state.flagAttempts.push({
          value: data.value ?? "",
          result: data.result ?? "incorrect",
        });

        if (ctx.sessionId && state.challengeName) {
          SessionsModel.updateOne(
            { sessionId: ctx.sessionId, "ctfConfig.solveHistory.challengeName": state.challengeName },
            { $inc: { "ctfConfig.solveHistory.$.attempts": 1 } },
          ).catch(() => {});
        }

        return {
          output: `Flag attempt recorded: "${data.value}" → ${data.result ?? "incorrect"}`,
          exitCode: 0,
        };
      }

      case "confirm_flag": {
        const flagValue =
          str(data.value) ||
          str(data.flag) ||
          str(data.confirmedFlag);
        if (!flagValue) {
          return {
            output: "confirm_flag requires data.value (or data.flag) with the flag string.",
            exitCode: 1,
          };
        }

        state.confirmedFlag = flagValue;
        // confirm_flag means "candidate flag found", not yet verified correct by CTFd.
        state.challengeStatus = "flag_found";

        const flag = state.confirmedFlag;
        let persistNote = "";
        let challengeNameForSubmit: string | undefined;
        let challengeIdForSubmit: number | undefined;
        let autoSubmitNote = "";
        let shouldMarkSubmitted = false;
        let ctfdResult = "";
        let timeToFlagNote = "";

        if (ctx.sessionId) {
          try {
            const session = await SessionsModel.findOne({ sessionId: ctx.sessionId })
              .select("ctfConfig")
              .lean();

            if (session?.ctfConfig) {
              const cfg = session.ctfConfig as any;
              const history: any[] = cfg.solveHistory ?? [];

              let challengeName: string | undefined =
                (typeof data.challengeName === "string" && data.challengeName.trim()) ||
                state.challengeName ||
                cfg.activeSolve?.name;

              if (!challengeName && history.length) {
                const solving = [...history]
                  .reverse()
                  .find((r) => r.status === "solving");
                challengeName = solving?.challengeName;
              }

              if (challengeName) {
                state.challengeName = challengeName;
                challengeNameForSubmit = challengeName;

                const existing = history.find((r) => r.challengeName === challengeName);
                const safeDir =
                  existing?.safeDir ||
                  cfg.activeSolve?.safeDir ||
                  sanitizeDirName(challengeName);
                const category =
                  existing?.category ?? cfg.activeSolve?.category ?? "";
                const challengeId = existing?.challengeId;
                challengeIdForSubmit = challengeId;

                if (existing) {
                  await SessionsModel.updateOne(
                    {
                      sessionId: ctx.sessionId,
                      "ctfConfig.solveHistory.challengeName": challengeName,
                    },
                    {
                      $set: {
                        "ctfConfig.solveHistory.$.status": "flag_found",
                        "ctfConfig.solveHistory.$.confirmedFlag": flag,
                        "ctfConfig.solveHistory.$.solvedAt": new Date(),
                        "ctfConfig.solveHistory.$.submittedToCtfd": false,
                        "ctfConfig.solveHistory.$.ctfdResult": "",
                        ...(challengeId != null
                          ? { "ctfConfig.solveHistory.$.challengeId": challengeId }
                          : {}),
                      },
                      $inc: { "ctfConfig.solveHistory.$.attempts": 1 },
                    },
                  );
                } else {
                  await SessionsModel.updateOne(
                    { sessionId: ctx.sessionId },
                    {
                      $push: {
                        "ctfConfig.solveHistory": {
                          challengeName,
                          challengeId,
                          safeDir,
                          category,
                          status: "flag_found",
                          confirmedFlag: flag,
                          attempts: 1,
                          startedAt: cfg.activeSolve?.setAt ?? new Date(),
                          solvedAt: new Date(),
                          submittedToCtfd: false,
                          ctfdResult: "",
                        },
                      },
                    },
                  );
                }
                persistNote = " Saved to CTF dashboard.";

                const solvedAtMs = Date.now();
                const startMs = existing?.startedAt
                  ? new Date(existing.startedAt).getTime()
                  : cfg.activeSolve?.setAt
                    ? new Date(cfg.activeSolve.setAt).getTime()
                    : solvedAtMs;
                const elapsedSec = Math.max(0, Math.round((solvedAtMs - startMs) / 1000));
                if (elapsedSec > 0) {
                  timeToFlagNote = ` Time to flag: ${formatDurationSec(elapsedSec)}.`;
                }
              } else {
                persistNote =
                  " Not saved to CTF tab — pass data.challengeName (challenge title) or run /solve <name> first.";
              }
            }
          } catch (e: any) {
            console.error("[CTF] confirm_flag persist failed:", e.message);
            persistNote = ` (dashboard save error: ${e.message})`;
          }
        }

        // Best-effort auto-submit to CTFd for confirmed flags in CTF mode.
        if (ctx.sessionId && challengeNameForSubmit) {
          try {
            const session = await SessionsModel.findOne({ sessionId: ctx.sessionId })
              .select("ctfConfig")
              .lean();
            const cfg = session?.ctfConfig as any;
            const url = cfg?.url as string | undefined;
            const apiToken = cfg?.apiToken as string | undefined;
            const sessionCookie = cfg?.sessionCookie as string | undefined;

            if (url && (apiToken || sessionCookie)) {
              let resolvedId = challengeIdForSubmit;
              if (!resolvedId) {
                const axios = (await import("axios")).default;
                const listRes = await axios.get(`${url.replace(/\/+$/, "")}/api/v1/challenges`, {
                  headers: {
                    "Content-Type": "application/json",
                    ...(apiToken ? { Authorization: `Token ${apiToken}` } : {}),
                    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
                  },
                  timeout: 20_000,
                });
                const ctfdChallenges: any[] = listRes.data?.data || [];
                const match = ctfdChallenges.find(
                  (c: any) =>
                    c.name === challengeNameForSubmit ||
                    c.name?.toLowerCase?.() === challengeNameForSubmit?.toLowerCase?.(),
                );
                if (match?.id) resolvedId = match.id;
              }

              if (resolvedId) {
                const submitRes = await submitFlagToCtfd(url, resolvedId, flag, sessionCookie, apiToken);
                shouldMarkSubmitted =
                  submitRes.status === "correct" || submitRes.status === "already_solved";
                ctfdResult = submitRes.status;
                autoSubmitNote = ` Auto-submit to CTFd: ${submitRes.status}${submitRes.message ? ` (${submitRes.message})` : ""}.`;

                if (shouldMarkSubmitted) {
                  await SessionsModel.updateOne(
                    {
                      sessionId: ctx.sessionId,
                      "ctfConfig.solveHistory.challengeName": challengeNameForSubmit,
                    },
                    {
                      $set: {
                        "ctfConfig.solveHistory.$.status": "solved",
                        "ctfConfig.solveHistory.$.submittedToCtfd": true,
                        "ctfConfig.solveHistory.$.ctfdResult": ctfdResult,
                        ...(resolvedId != null
                          ? { "ctfConfig.solveHistory.$.challengeId": resolvedId }
                          : {}),
                      },
                    },
                  );
                } else {
                  const nextStatus =
                    ctfdResult === "incorrect" ? "incorrect" : "flag_found";
                  await SessionsModel.updateOne(
                    {
                      sessionId: ctx.sessionId,
                      "ctfConfig.solveHistory.challengeName": challengeNameForSubmit,
                    },
                    {
                      $set: {
                        "ctfConfig.solveHistory.$.status": nextStatus,
                        "ctfConfig.solveHistory.$.submittedToCtfd": false,
                        "ctfConfig.solveHistory.$.ctfdResult": ctfdResult || "unknown",
                      },
                    },
                  );
                }
              } else {
                autoSubmitNote =
                  " Auto-submit skipped: could not resolve challenge ID. Use Submit in CTF tab after Refresh.";
              }
            } else {
              autoSubmitNote =
                " Auto-submit skipped: CTFd auth missing. Re-auth in CTF tab.";
            }
          } catch (e: any) {
            autoSubmitNote = ` Auto-submit failed: ${e.message}`;
          }
        }

        return {
          output: `Flag confirmed: ${flag}.${persistNote}${timeToFlagNote}${autoSubmitNote}`,
          exitCode: 0,
        };
      }

      case "add_distfile_analysis":
        state.distfiles.push({
          filename: data.filename ?? "unknown",
          fileType: data.fileType ?? "unknown",
          findings: data.findings ?? "",
        });
        return {
          output: `Distfile analysis for ${data.filename} recorded.`,
          exitCode: 0,
        };

      case "add_key_discovery":
        state.keyDiscoveries.push(data.discovery ?? data.value ?? "");
        return {
          output: `Key discovery recorded: ${data.discovery ?? data.value}`,
          exitCode: 0,
        };

      case "set_challenge_status":
        state.challengeStatus = data.status ?? state.challengeStatus;
        return {
          output: `Challenge status: ${state.challengeStatus}`,
          exitCode: 0,
        };

      // ─── Shared actions ─────────────────────────────────────────
      case "add_file":
        state.files.push({
          path: data.path ?? "unknown",
          description: data.description ?? "",
        });
        return {
          output: `File ${data.path} recorded.`,
          exitCode: 0,
        };

      case "log_approach":
        if (!str(data.technique)) {
          return { output: "log_approach requires data.technique", exitCode: 1 };
        }
        state.approachesTried.push({
          technique: data.technique ?? "",
          target: data.target ?? "",
          result: data.result ?? "failed",
          detail: data.detail ?? "",
        });
        return {
          output: `Approach logged: ${data.technique} → ${data.result ?? "failed"}`,
          exitCode: 0,
        };

      case "set_next_steps": {
        const steps = data.steps ?? data.nextSteps;
        state.nextSteps = Array.isArray(steps) ? steps : [steps];
        return {
          output: `Next steps updated (${state.nextSteps.length} items).`,
          exitCode: 0,
        };
      }

      default:
        return { output: `Unknown action: ${action}`, exitCode: 1 };
    }
  },
};

export default updateEngagementState;

import { ToolDefinition } from "../types";
import {
  runNmap,
  runNuclei,
  runSqlmap,
  runFfuf,
  runGobuster,
  runHydra,
  isToolAvailable,
} from "../../services/toolWrappers";
import { validateCommandScope, createDefaultScopeConfig } from "../../utils/scopeValidator";
import { assertTargetIsExternal, blockedTargetResult } from "../../utils/ssrfGuard";
import { getHITLManager } from "../../services/hitlPolicy";
import {
  runSelfCorrection,
  createDefaultSelfCorrectionConfig,
  isRetryableError,
  isFatalError,
} from "../../services/selfCorrection";

const runSecurityTool: ToolDefinition = {
  name: "run_security_tool",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Run a security tool (nmap, nuclei, sqlmap, ffuf, gobuster, hydra) against a target. " +
    "This is a direct connector to security tools. The command will be validated against " +
    "the engagement scope before execution. High-risk commands require user approval.",
  parameters: {
    type: "object",
    properties: {
      tool: {
        type: "string",
        enum: ["nmap", "nuclei", "sqlmap", "ffuf", "gobuster", "hydra"],
        description: "The security tool to run",
      },
      target: {
        type: "string",
        description: "The target IP, domain, or URL",
      },
      options: {
        type: "object",
        description: "Tool-specific options (ports, wordlist, severity, etc.)",
      },
      require_approval: {
        type: "boolean",
        description: "Set to true to require user approval before running (for high-risk commands)",
      },
    },
    required: ["tool", "target"],
  },
  timeoutMs: 300_000,
  async execute(args, ctx) {
    const { tool, target, options = {}, require_approval } = args;

    if (!tool || !target) {
      return { output: "Error: tool and target are required", exitCode: 1 };
    }

    // SSRF guard: resolve the target's latest DNS records and reject any
    // internal/private address (loopback, RFC1918, cloud metadata, …).
    try {
      await assertTargetIsExternal(target);
    } catch {
      return blockedTargetResult();
    }

    // Check tool availability
    const available = await isToolAvailable(tool);
    if (!available) {
      return {
        output: `Error: tool '${tool}' is not installed or not available in the environment.`,
        exitCode: 1,
      };
    }

    // Validate scope (workspace allowlist when configured, else global env)
    const scopeConfig = ctx.guardrails?.scope ?? createDefaultScopeConfig();
    const scopeResult = validateCommandScope(`${tool} ${target}`, scopeConfig);
    if (!scopeResult.allowed) {
      return {
        output: `BLOCKED: ${scopeResult.reason}`,
        exitCode: 1,
      };
    }

    // Check HITL approval for high-risk commands. In autonomous workspace mode,
    // high/medium-risk actions are pre-authorized — but only when they are
    // non-destructive and already passed the scope check above. "dangerous" /
    // "critical" commands always require a human.
    if (require_approval) {
      const hitl = getHITLManager();
      const assessment = hitl.shouldRequestApproval(`${tool} ${target}`);
      const autonomousSkip =
        ctx.guardrails?.autonomousMode === true &&
        assessment.category !== "dangerous" &&
        assessment.riskLevel !== "critical";
      if (assessment.requiresApproval && !autonomousSkip) {
        const approval = hitl.requestApproval(
          ctx.sessionId ?? "unknown",
          `${tool} ${target}`,
          assessment,
        );
        return {
          output: `APPROVAL REQUIRED: ${assessment.reason}\nApproval ID: ${approval.approvalId}\nRisk level: ${assessment.riskLevel}\n\nPlease ask the user to approve this command before proceeding.`,
          exitCode: 2,
        };
      }
    }

    // Execute the tool
    let result;
    switch (tool) {
      case "nmap":
        result = await runNmap({
          target,
          ports: options.ports,
          scanType: options.scanType,
          verbose: options.verbose,
          outputXml: options.outputXml,
          extraFlags: options.extraFlags,
        });
        break;
      case "nuclei":
        result = await runNuclei({
          target,
          templates: options.templates,
          severity: options.severity,
          tags: options.tags,
          outputJson: options.outputJson,
          extraFlags: options.extraFlags,
        });
        break;
      case "sqlmap":
        result = await runSqlmap({
          url: target,
          data: options.data,
          level: options.level,
          risk: options.risk,
          batch: options.batch ?? true,
          dump: options.dump,
          dbms: options.dbms,
          extraFlags: options.extraFlags,
        });
        break;
      case "ffuf":
        result = await runFfuf({
          url: target,
          wordlist: options.wordlist ?? "/usr/share/wordlists/dirb/common.txt",
          method: options.method,
          extensions: options.extensions,
          threads: options.threads,
          outputJson: options.outputJson,
          extraFlags: options.extraFlags,
        });
        break;
      case "gobuster":
        result = await runGobuster({
          target,
          wordlist: options.wordlist ?? "/usr/share/wordlists/dirb/common.txt",
          mode: options.mode,
          extensions: options.extensions,
          threads: options.threads,
          extraFlags: options.extraFlags,
        });
        break;
      case "hydra":
        result = await runHydra({
          target,
          service: options.service ?? "ssh",
          username: options.username,
          usernameList: options.usernameList,
          password: options.password,
          passwordList: options.passwordList,
          port: options.port,
          threads: options.threads,
          extraFlags: options.extraFlags,
        });
        break;
      default:
        return { output: `Error: unsupported tool '${tool}'`, exitCode: 1 };
    }

    if (result.success) {
      return {
        output: `[${tool}] completed successfully (${result.durationMs}ms)\n\n${result.stdout}`,
        exitCode: 0,
      };
    }

    // ─── Self-Correction Loop ────────────────────────────────────────
    // When the tool fails with a retryable error, attempt to correct the
    // command automatically (e.g. wrong flag, syntax error, connection issue).
    const errorOutput = `${result.stderr}\n${result.stdout}`;
    const selfCorrectionConfig = createDefaultSelfCorrectionConfig();

    if (
      selfCorrectionConfig.enabled &&
      isRetryableError(errorOutput, selfCorrectionConfig) &&
      !isFatalError(errorOutput, selfCorrectionConfig)
    ) {
      const initialToolResult = {
        output: errorOutput,
        exitCode: result.exitCode,
      };

      const correctionResult = await runSelfCorrection(
        `${tool} ${target}`,
        initialToolResult,
        async (correctedCommand) => {
          // Re-run the tool with the corrected command
          const correctedArgs = correctedCommand.split(" ").slice(1);
          const correctedTarget = correctedArgs[0] ?? target;
          const correctedOptions = { ...options, extraFlags: correctedArgs.slice(1) };

          let retryResult;
          switch (tool) {
            case "nmap":
              retryResult = await runNmap({
                target: correctedTarget,
                ports: correctedOptions.ports,
                scanType: correctedOptions.scanType,
                verbose: correctedOptions.verbose,
                outputXml: correctedOptions.outputXml,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            case "nuclei":
              retryResult = await runNuclei({
                target: correctedTarget,
                templates: correctedOptions.templates,
                severity: correctedOptions.severity,
                tags: correctedOptions.tags,
                outputJson: correctedOptions.outputJson,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            case "sqlmap":
              retryResult = await runSqlmap({
                url: correctedTarget,
                data: correctedOptions.data,
                level: correctedOptions.level,
                risk: correctedOptions.risk,
                batch: correctedOptions.batch ?? true,
                dump: correctedOptions.dump,
                dbms: correctedOptions.dbms,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            case "ffuf":
              retryResult = await runFfuf({
                url: correctedTarget,
                wordlist: correctedOptions.wordlist ?? "/usr/share/wordlists/dirb/common.txt",
                method: correctedOptions.method,
                extensions: correctedOptions.extensions,
                threads: correctedOptions.threads,
                outputJson: correctedOptions.outputJson,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            case "gobuster":
              retryResult = await runGobuster({
                target: correctedTarget,
                wordlist: correctedOptions.wordlist ?? "/usr/share/wordlists/dirb/common.txt",
                mode: correctedOptions.mode,
                extensions: correctedOptions.extensions,
                threads: correctedOptions.threads,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            case "hydra":
              retryResult = await runHydra({
                target: correctedTarget,
                service: correctedOptions.service ?? "ssh",
                username: correctedOptions.username,
                usernameList: correctedOptions.usernameList,
                password: correctedOptions.password,
                passwordList: correctedOptions.passwordList,
                port: correctedOptions.port,
                threads: correctedOptions.threads,
                extraFlags: correctedOptions.extraFlags,
              });
              break;
            default:
              return { output: `Error: unsupported tool '${tool}'`, exitCode: 1 };
          }

          if (retryResult.success) {
            return {
              output: `[${tool}] completed successfully after self-correction (${retryResult.durationMs}ms)\n\n${retryResult.stdout}`,
              exitCode: 0,
            };
          }
          return {
            output: `[${tool}] failed after self-correction (exit code ${retryResult.exitCode})\n\nSTDERR:\n${retryResult.stderr}\n\nSTDOUT:\n${retryResult.stdout}`,
            exitCode: retryResult.exitCode,
          };
        },
        selfCorrectionConfig,
      );

      if (correctionResult.corrected) {
        return correctionResult.finalResult;
      }

      // If self-correction exhausted, return the last result with a note
      const attemptsNote = correctionResult.attempts.length > 0
        ? `\n\n[Self-correction] ${correctionResult.attempts.length} attempt(s) made, all failed.`
        : "";
      return {
        output: `[${tool}] failed (exit code ${result.exitCode})\n\nSTDERR:\n${result.stderr}\n\nSTDOUT:\n${result.stdout}${attemptsNote}`,
        exitCode: result.exitCode,
      };
    }

    return {
      output: `[${tool}] failed (exit code ${result.exitCode})\n\nSTDERR:\n${result.stderr}\n\nSTDOUT:\n${result.stdout}`,
      exitCode: result.exitCode,
    };
  },
};

export default runSecurityTool;

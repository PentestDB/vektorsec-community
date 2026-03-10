import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";
import SessionsModel, { AgentMessageDoc, SubagentStatus } from "../models/Sessions/Sessions.model";
import { ShellManager } from "./shell.manager";
import { SSEWriter } from "./agent.service";
import { toolRegistry } from "../tools/registry";
import { getUnconfiguredToolNames } from "../utils/toolAvailability";
import { invoke_llm_streaming, ToolCallData } from "../utils/llm/providers";
import { shouldSummarize, summarizeMessages, messagesToOpenAI } from "./context.service";
import { ExecutionContext, ToolResult } from "../tools/types";
import UserModel from "../models/User/User.model";

const MAX_SUBAGENT_ITERATIONS = 15;
const MAX_SUBAGENT_WALL_CLOCK_MS = 10 * 60 * 1000; // 10 minutes
const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;
const MAX_OUTPUT_CHARS = 12_000;

export interface SubagentResult {
  subagentId: string;
  status: SubagentStatus;
  result: string;
  shells: string[];
}

function truncateOutput(output: string): string {
  const cleaned = output.replace(ANSI_REGEX, "").trim();
  if (cleaned.length <= MAX_OUTPUT_CHARS) return cleaned;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return (
    cleaned.slice(0, half) +
    `\n\n... [truncated ${cleaned.length - MAX_OUTPUT_CHARS} chars] ...\n\n` +
    cleaned.slice(-half)
  );
}

function buildSubagentSystemPrompt(task: string, parentSessionId: string): string {
  return `<role>
You are a Pentest Copilot subagent. You are a specialized parallel worker launched by the main agent to investigate a specific aspect of a penetration test.
</role>

<task>
${task}
</task>

<behavior>
- Focus exclusively on the task described above. Be thorough but efficient.
- Execute tools autonomously to achieve the task goal.
- Think step-by-step: explain your reasoning briefly before each action.
- You have access to the same Kali Linux attack box as the main agent.
- Use spawn_shell for long-running processes or netcat listeners.
- When done, provide a clear structured summary of your findings.
- You cannot spawn further subagents.
</behavior>

<environment>
- Parent Session ID: ${parentSessionId}
- Attack box: Kali Linux with root access
</environment>

<output_format>
When you complete your investigation, provide a structured summary:
- FINDINGS: Key discoveries (vulnerabilities, services, credentials, etc.)
- EVIDENCE: Commands and output supporting your findings
- RECOMMENDATIONS: Suggested next steps for the main agent
- FILES: Any output files created on disk
</output_format>`;
}

export class SubagentManager extends EventEmitter {
  private sessionId: string;
  private shellManager: ShellManager;
  private runningSubagents: Map<string, AbortController> = new Map();
  private completionCallbacks: Map<string, Array<(result: SubagentResult) => void>> = new Map();

  constructor(sessionId: string, shellManager: ShellManager) {
    super();
    this.sessionId = sessionId;
    this.shellManager = shellManager;
  }

  async spawn(params: {
    parentId: string;
    task: string;
    sse: SSEWriter;
    userId: string;
  }): Promise<string> {
    const subagentId = `sub_${uuidv4().slice(0, 8)}`;

    await SessionsModel.updateOne(
      { sessionId: this.sessionId },
      {
        $push: {
          subagents: {
            subagentId,
            parentId: params.parentId,
            task: params.task,
            status: "running",
            messages: [],
            shells: [],
            createdAt: new Date(),
          },
        },
      },
    );

    params.sse.write("subagent_spawned", {
      subagentId,
      task: params.task,
      parentId: params.parentId,
    });

    const abortCtrl = new AbortController();
    this.runningSubagents.set(subagentId, abortCtrl);

    const wallClockTimer = setTimeout(() => {
      console.warn(`[SubagentManager] Subagent ${subagentId} hit wall-clock limit (${MAX_SUBAGENT_WALL_CLOCK_MS / 1000}s), aborting`);
      abortCtrl.abort();
    }, MAX_SUBAGENT_WALL_CLOCK_MS);

    this.runSubagentLoop({
      subagentId,
      task: params.task,
      sse: params.sse,
      userId: params.userId,
      abortSignal: abortCtrl.signal,
    })
      .catch((err) => {
        console.error(`[SubagentManager] Subagent ${subagentId} loop error:`, err);
      })
      .finally(() => {
        clearTimeout(wallClockTimer);
      });

    return subagentId;
  }

  private async runSubagentLoop(params: {
    subagentId: string;
    task: string;
    sse: SSEWriter;
    userId: string;
    abortSignal: AbortSignal;
  }): Promise<void> {
    const { subagentId, task, sse, userId, abortSignal } = params;

    const session = await SessionsModel.findOne({ sessionId: this.sessionId }).lean();
    const disabledAgentTools: string[] = session?.disabledAgentTools ?? [];

    const systemMsg: AgentMessageDoc = {
      id: `sys_${subagentId}`,
      role: "system",
      content: buildSubagentSystemPrompt(task, this.sessionId),
      timestamp: new Date(),
      turnIndex: 0,
    };

    const userMsg: AgentMessageDoc = {
      id: uuidv4(),
      role: "user",
      content: task,
      timestamp: new Date(),
      turnIndex: 0,
    };

    let messages: AgentMessageDoc[] = [systemMsg, userMsg];
    const shellsCreated: string[] = [];
    let iteration = 0;
    let finalResult = "";

    const buildCtx = (onChunk?: (chunk: string) => void): ExecutionContext => ({
      sessionId: this.sessionId,
      agentId: subagentId,
      runCommand: (cmd, timeoutMs) =>
        this.shellManager.execInShell(cmd, timeoutMs, onChunk, abortSignal),
      spawnShell: async (label, type, purpose) => {
        const id = await this.shellManager.spawnShell({
          label: `[${subagentId}] ${label}`,
          type,
          purpose,
          createdBy: "subagent",
          subagentId,
        });
        shellsCreated.push(id);
        await SessionsModel.updateOne(
          { sessionId: this.sessionId, "subagents.subagentId": subagentId },
          { $push: { "subagents.$.shells": id } },
        );
        sse.write("subagent_progress", { subagentId, type: "shell_spawned", content: id });
        return id;
      },
      writeToShell: (shellId, data) => this.shellManager.writeToShell(shellId, data),
      readShellOutput: (shellId, fromOffset) =>
        Promise.resolve(this.shellManager.readOutput(shellId, fromOffset)),
      closeShell: (shellId) => this.shellManager.closeShell(shellId),
      listShells: () => this.shellManager.getShellList(),
      getShellInfo: (shellId) => this.shellManager.getShell(shellId),
      onOutput: onChunk,
    });

    try {
      while (iteration < MAX_SUBAGENT_ITERATIONS) {
        iteration++;
        if (abortSignal.aborted) break;

        if (await shouldSummarize(messages)) {
          const { preservedMessages } = await summarizeMessages(messages);
          messages = preservedMessages;

          const shellStatusMsg = this.buildShellStatusMessage(shellsCreated);
          if (shellStatusMsg) messages.push(shellStatusMsg);
        }

        const openaiMessages = messagesToOpenAI(messages);
        const unconfiguredTools = getUnconfiguredToolNames();
        const tools = toolRegistry.toOpenAISchemas({
          excludeSubagent: true,
          disabledTools: disabledAgentTools,
          unconfiguredTools,
        });

        let assistantContent = "";
        let assistantToolCalls: ToolCallData[] = [];

        const result = await invoke_llm_streaming({
          messages: openaiMessages,
          tools,
          temperature: 0.7,
          sessionId: this.sessionId,
          userId,
          tags: ["subagent", subagentId],
          generationName: `subagent-${subagentId}-iter-${iteration}`,
          abortSignal,
          onDelta(delta) {
            if (delta.type === "text" && delta.content) {
              assistantContent += delta.content;
              sse.write("subagent_progress", {
                subagentId,
                type: "thinking",
                content: delta.content,
              });
            }
            if (delta.type === "tool_call_start" && delta.toolCall) {
              sse.write("subagent_progress", {
                subagentId,
                type: "tool_call_start",
                content: JSON.stringify({ id: delta.toolCall.id, name: delta.toolCall.name }),
              });
            }
            if (delta.type === "tool_call_done" && delta.toolCall) {
              sse.write("subagent_progress", {
                subagentId,
                type: "tool_call_ready",
                content: JSON.stringify({
                  id: delta.toolCall.id,
                  name: delta.toolCall.name,
                  arguments: delta.toolCall.arguments,
                }),
              });
            }
          },
        });

        assistantToolCalls = result.toolCalls;

        const assistantMsg: AgentMessageDoc = {
          id: uuidv4(),
          role: "assistant",
          content: assistantContent || null,
          toolCalls: assistantToolCalls.length ? assistantToolCalls : undefined,
          timestamp: new Date(),
          turnIndex: 0,
        };
        messages.push(assistantMsg);

        if (result.finishReason === "stop" || assistantToolCalls.length === 0) {
          finalResult = assistantContent;
          break;
        }

        for (const tc of assistantToolCalls) {
          if (abortSignal.aborted) break;

          const toolDef = toolRegistry.get(tc.name);
          if (!toolDef) {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: `Unknown tool: ${tc.name}`,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          let args: Record<string, any>;
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: `Failed to parse arguments: ${tc.arguments}`,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          const user = await UserModel.findById(userId).lean();
          const disableSafety = user?.configs?.disableSafetyProtections ?? false;

          const ctx = buildCtx((chunk) => {
            sse.write("subagent_progress", {
              subagentId,
              type: "tool_output",
              content: chunk,
            });
          });

          if (!disableSafety && toolDef.shouldRequireConsent?.(args, ctx)) {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: "Blocked: this command was flagged as potentially destructive. Subagents cannot execute dangerous commands. Use a different approach or ask the main agent to run this with user approval.",
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          sse.write("subagent_progress", {
            subagentId,
            type: "tool_start",
            content: JSON.stringify({ name: tc.name, args }),
          });

          try {
            const toolResult = await toolDef.execute(args, ctx);
            toolResult.output = truncateOutput(toolResult.output);

            sse.write("subagent_progress", {
              subagentId,
              type: "tool_done",
              content: JSON.stringify({ name: tc.name, exitCode: toolResult.exitCode }),
            });

            messages.push({
              id: uuidv4(),
              role: "tool",
              content: toolResult.output,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
          } catch (err: any) {
            const errMsg = `Tool error: ${err.message}`;
            sse.write("subagent_progress", {
              subagentId,
              type: "tool_error",
              content: errMsg,
            });
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: errMsg,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
          }
        }
      }

      if (!finalResult && iteration >= MAX_SUBAGENT_ITERATIONS) {
        finalResult = `Subagent reached max iterations (${MAX_SUBAGENT_ITERATIONS}). Last assistant response:\n${messages.filter((m) => m.role === "assistant").pop()?.content ?? "none"}`;
      }

      if (!finalResult && abortSignal.aborted) {
        finalResult = `Subagent was aborted (wall-clock timeout or manual cancel). Last assistant response:\n${messages.filter((m) => m.role === "assistant").pop()?.content ?? "none"}`;
      }

      const status: SubagentStatus = abortSignal.aborted ? "cancelled" : "completed";

      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "subagents.subagentId": subagentId },
        {
          $set: {
            "subagents.$.status": status,
            "subagents.$.result": finalResult,
            "subagents.$.messages": messages,
            "subagents.$.completedAt": new Date(),
          },
        },
      );

      const result: SubagentResult = {
        subagentId,
        status,
        result: finalResult,
        shells: shellsCreated,
      };

      if (status === "completed") {
        sse.write("subagent_completed", { subagentId, result: finalResult });
      } else {
        sse.write("subagent_failed", { subagentId, error: "Cancelled" });
      }

      this.runningSubagents.delete(subagentId);
      this.notifyCompletion(subagentId, result);
    } catch (err: any) {
      console.error(`[SubagentManager] Subagent ${subagentId} error:`, err);

      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "subagents.subagentId": subagentId },
        {
          $set: {
            "subagents.$.status": "failed",
            "subagents.$.result": err.message,
            "subagents.$.messages": messages,
            "subagents.$.completedAt": new Date(),
          },
        },
      );

      sse.write("subagent_failed", { subagentId, error: err.message });
      this.runningSubagents.delete(subagentId);
      this.notifyCompletion(subagentId, {
        subagentId,
        status: "failed",
        result: err.message,
        shells: shellsCreated,
      });
    }
  }

  private buildShellStatusMessage(ownedShellIds: string[]): AgentMessageDoc | null {
    const allShells = this.shellManager.getShellList();
    const relevant = allShells.filter(
      (s) => ownedShellIds.includes(s.shellId) && s.status === "active",
    );
    if (relevant.length === 0) return null;

    const lines = relevant.map(
      (s) => `  - ${s.shellId} | label: "${s.label}" | type: ${s.type}`,
    );
    return {
      id: `shell_status_${Date.now()}`,
      role: "system",
      content: `[Your active shells]\n${lines.join("\n")}`,
      timestamp: new Date(),
      turnIndex: 0,
    };
  }

  waitFor(subagentIds: string[]): Promise<SubagentResult[]> {
    return Promise.all(
      subagentIds.map(
        (id) =>
          new Promise<SubagentResult>((resolve) => {
            if (!this.runningSubagents.has(id)) {
              this.getResult(id)
                .then(resolve)
                .catch(() =>
                  resolve({ subagentId: id, status: "failed", result: "Failed to retrieve subagent result", shells: [] }),
                );
              return;
            }
            const cbs = this.completionCallbacks.get(id) ?? [];
            cbs.push(resolve);
            this.completionCallbacks.set(id, cbs);
          }),
      ),
    );
  }

  private notifyCompletion(subagentId: string, result: SubagentResult): void {
    const cbs = this.completionCallbacks.get(subagentId);
    if (cbs) {
      for (const cb of cbs) cb(result);
      this.completionCallbacks.delete(subagentId);
    }
  }

  private async getResult(subagentId: string): Promise<SubagentResult> {
    const session = await SessionsModel.findOne(
      { sessionId: this.sessionId },
      { subagents: { $elemMatch: { subagentId } } },
    );
    const sub = session?.subagents?.[0];
    return {
      subagentId,
      status: (sub?.status as SubagentStatus) ?? "failed",
      result: sub?.result ?? "No result found",
      shells: sub?.shells ?? [],
    };
  }

  async cancel(subagentId: string): Promise<void> {
    const ctrl = this.runningSubagents.get(subagentId);
    if (ctrl) {
      ctrl.abort();
    }
  }

  async cancelAll(): Promise<void> {
    for (const [, ctrl] of this.runningSubagents) {
      ctrl.abort();
    }
  }

  getRunningIds(): string[] {
    return Array.from(this.runningSubagents.keys());
  }

  isRunning(subagentId: string): boolean {
    return this.runningSubagents.has(subagentId);
  }
}

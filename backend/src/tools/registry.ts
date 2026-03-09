import OpenAI from "openai";
import { ToolDefinition, toolToOpenAISchema } from "./types";

import runBash from "./handlers/run-bash";
import runPythonScript from "./handlers/run-python-script";
import runInstallTool from "./handlers/run-install-tool";
import googleSearch from "./handlers/google-search";
import askUser from "./handlers/generic-response";
import spawnShell from "./handlers/spawn-shell";
import writeToShell from "./handlers/write-to-shell";
import readShell from "./handlers/read-shell";
import listShells from "./handlers/list-shells";
import closeShell from "./handlers/close-shell";
import spawnSubagent from "./handlers/spawn-subagent";

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  toOpenAISchemas(opts?: { excludeSubagent?: boolean }): OpenAI.Chat.ChatCompletionTool[] {
    let tools = this.getAll();
    if (opts?.excludeSubagent) {
      tools = tools.filter((t) => t.name !== "spawn_subagent");
    }
    return tools.map(toolToOpenAISchema);
  }

  requiresConsent(name: string): boolean {
    return this.tools.get(name)?.requiresConsent ?? false;
  }

  getTimeout(name: string): number {
    return this.tools.get(name)?.timeoutMs ?? 300_000;
  }
}

export const toolRegistry = new ToolRegistry();

toolRegistry.register(runBash);
toolRegistry.register(runPythonScript);
toolRegistry.register(runInstallTool);
toolRegistry.register(googleSearch);
toolRegistry.register(askUser);
toolRegistry.register(spawnShell);
toolRegistry.register(writeToShell);
toolRegistry.register(readShell);
toolRegistry.register(listShells);
toolRegistry.register(closeShell);
toolRegistry.register(spawnSubagent);

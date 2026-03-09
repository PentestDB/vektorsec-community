import OpenAI from "openai";
import { ToolDefinition, toolToOpenAISchema } from "./types";

import runBash from "./handlers/run-bash";
import runPythonScript from "./handlers/run-python-script";
import runInstallTool from "./handlers/run-install-tool";
import googleSearch from "./handlers/google-search";
import msfvenomPayload from "./handlers/msfvenom-payload";
import netcatListener from "./handlers/netcat-listener";
import askUser from "./handlers/generic-response";

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

  toOpenAISchemas(): OpenAI.Chat.ChatCompletionTool[] {
    return this.getAll().map(toolToOpenAISchema);
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
toolRegistry.register(msfvenomPayload);
toolRegistry.register(netcatListener);
toolRegistry.register(askUser);

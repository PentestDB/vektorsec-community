import { ToolDefinition, ToolResult } from "./types";
import { toolRegistry } from "./registry";

export { ToolDefinition, ToolResult, ExecutionContext } from "./types";

export interface RegisterToolOptions {
  /** Allow replacing an existing built-in tool with the same name (default false). */
  overwrite?: boolean;
}

function assertValidTool(tool: ToolDefinition): void {
  if (!tool || typeof tool !== "object") {
    throw new Error("Invalid tool: expected a ToolDefinition object");
  }
  if (!tool.name || !/^[a-z0-9_]+$/.test(tool.name)) {
    throw new Error(
      `Invalid tool name "${tool?.name}": use lowercase letters, digits and underscores only`,
    );
  }
  if (!tool.description || typeof tool.description !== "string") {
    throw new Error(`Tool "${tool?.name}" requires a description`);
  }
  if (!tool.parameters || typeof tool.parameters !== "object") {
    throw new Error(`Tool "${tool?.name}" requires a JSON-schema parameters object`);
  }
  if (typeof tool.execute !== "function") {
    throw new Error(`Tool "${tool?.name}" requires an execute function`);
  }
}

/**
 * Small authoring helper for custom tools / plugins. Validates the definition
 * and fills in safe defaults so a plugin only has to describe its core parts.
 *
 * @example
 *   const myTool = defineTool({
 *     name: "my_tool",
 *     description: "…",
 *     parameters: { type: "object", properties: {} },
 *     async execute(args, ctx) { return { output: "ok", exitCode: 0 }; },
 *   });
 */
export function defineTool<T extends ToolDefinition>(tool: T): T {
  assertValidTool(tool);
  if (!tool.timeoutMs) tool.timeoutMs = 30_000;
  if (!tool.allowedRoles) tool.allowedRoles = ["orchestrator", "swarm_agent"];
  return tool;
}

/** Register a single custom tool into the shared Tool Registry. */
export function registerTool(tool: ToolDefinition, opts?: RegisterToolOptions): ToolDefinition {
  const prepared = defineTool(tool);
  if (toolRegistry.has(prepared.name) && !opts?.overwrite) {
    throw new Error(
      `Tool "${prepared.name}" is already registered. Pass { overwrite: true } to replace it.`,
    );
  }
  toolRegistry.register(prepared);
  return prepared;
}

/** Register several tools at once (handy for a plugin that ships multiple tools). */
export function registerTools(tools: ToolDefinition[], opts?: RegisterToolOptions): ToolDefinition[] {
  return tools.map((tool) => registerTool(tool, opts));
}

/** True when a tool name is already registered. */
export function isToolRegistered(name: string): boolean {
  return toolRegistry.has(name);
}

/** Remove a tool (useful for tests and for opt-out plugins). */
export function unregisterTool(name: string): boolean {
  return toolRegistry.unregister(name);
}

/** Shape every scanner / plugin result follows so agents can parse them. */
export function okResult(output: string): ToolResult {
  return { output, exitCode: 0 };
}

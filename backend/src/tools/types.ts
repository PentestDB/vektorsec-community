export interface ToolArgDefinition {
  type: "string";
  required: boolean;
  description: string;
}

export interface ToolExecutionContext {
  commandId: string;
  args: Record<string, string>;
  choice: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  args: Record<string, ToolArgDefinition>;
  outputFileField?: string;
  execute: (ctx: ToolExecutionContext) => Promise<string>;
}

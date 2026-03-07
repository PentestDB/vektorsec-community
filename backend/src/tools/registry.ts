import { ToolDefinition, ToolExecutionContext } from "./types";
import { runBashTool } from "./handlers/run-bash";
import { googleSearchTool } from "./handlers/google-search";
import { genericResponseTool } from "./handlers/generic-response";
import { netcatListenerTool } from "./handlers/netcat-listener";
import { msfvenomPayloadTool } from "./handlers/msfvenom-payload";

const tools: ToolDefinition[] = [
  googleSearchTool,
  runBashTool,
  genericResponseTool,
  netcatListenerTool,
  msfvenomPayloadTool,
];

class ToolRegistry {
  private tools: Map<string, ToolDefinition>;

  constructor(toolList: ToolDefinition[]) {
    this.tools = new Map();
    for (const tool of toolList) {
      this.tools.set(tool.name, tool);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(name: string, ctx: ToolExecutionContext): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(ctx);
  }

  generatePromptList(): string {
    return this.getAll()
      .map((tool, index) => {
        const argsSchema = Object.entries(tool.args)
          .map(([key, def]) => `"${key}": "<${key}>"`)
          .join(", ");

        const fileField = tool.outputFileField
          ? `, file_name: ["file_name"] (${tool.name === "msfvenom_payload" ? "Required" : "Optional"})`
          : "";

        return `${index + 1}. ${tool.name}: ${tool.description}, args: {${argsSchema}}${fileField}`;
      })
      .join("\n");
  }
}

export const toolRegistry = new ToolRegistry(tools);
export { ToolDefinition, ToolExecutionContext } from "./types";

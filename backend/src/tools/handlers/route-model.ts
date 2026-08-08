import { ToolDefinition } from "../types";
import {
  routeTask,
  detectTaskType,
  isLocalLlmAvailable,
  TaskType,
} from "../../services/modelRouter";

const routeModel: ToolDefinition = {
  name: "route_model",
  allowedRoles: ["orchestrator"],
  description:
    "Route a task to the most appropriate LLM model based on the task type. " +
    "Use this to determine which model should handle a specific task (parsing logs, " +
    "generating exploit scripts, summarizing, etc.) to optimize cost and quality.",
  parameters: {
    type: "object",
    properties: {
      task_type: {
        type: "string",
        enum: [
          "parse_log", "extract_urls", "summarize", "exploit_script",
          "reverse_shell", "bypass_payload", "recon_analysis",
          "vuln_analysis", "report_generation", "general",
        ],
        description: "The type of task to route (optional - will auto-detect if not provided)",
      },
      prompt: {
        type: "string",
        description: "The prompt/task description (used for auto-detection)",
      },
      prefer_local: {
        type: "boolean",
        description: "Prefer local LLM models (Ollama, DeepSeek, etc.)",
      },
      max_cost: {
        type: "number",
        description: "Maximum cost per 1K tokens",
      },
    },
    required: [],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { task_type, prompt, prefer_local, max_cost } = args;

    // Auto-detect task type if not provided
    let resolvedTaskType: TaskType;
    if (task_type) {
      resolvedTaskType = task_type as TaskType;
    } else if (prompt) {
      resolvedTaskType = detectTaskType(prompt);
    } else {
      return { output: "Error: either task_type or prompt is required", exitCode: 1 };
    }

    // Check if local LLM is available
    let localAvailable = false;
    if (prefer_local) {
      localAvailable = await isLocalLlmAvailable();
    }

    const decision = routeTask(resolvedTaskType, undefined, {
      preferLocal: prefer_local && localAvailable,
      maxCost: max_cost,
    });

    return {
      output: [
        `Task type: ${resolvedTaskType}`,
        `Recommended model: ${decision.modelName} (${decision.modelId})`,
        `Reason: ${decision.reason}`,
        `Estimated cost per 1K input tokens: $${decision.estimatedCost.toFixed(5)}`,
        localAvailable ? "Local LLM: available" : "Local LLM: not available",
      ].join("\n"),
      exitCode: 0,
    };
  },
};

export default routeModel;

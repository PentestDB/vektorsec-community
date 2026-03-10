import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";
import { z } from "zod";

const magnitudeBrowser: ToolDefinition = {
  name: "browser_action",
  description:
    "Perform an agentic browser action using the Magnitude browser agent. " +
    "Use this to interact with web applications during a penetration test — " +
    "e.g. filling forms, clicking buttons, navigating pages, extracting data. " +
    "The agent uses AI to interpret the page and carry out the goal autonomously. " +
    "Requires Magnitude to be enabled in Settings.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The target URL to navigate to before performing the action",
      },
      goal: {
        type: "string",
        description:
          "A natural-language description of what to do in the browser " +
          "(e.g. 'Log in with admin/admin and navigate to the user management page')",
      },
      extract: {
        type: "string",
        description:
          "Optional. A description of what data to extract from the page after performing the action " +
          "(e.g. 'Extract all usernames and email addresses from the table')",
      },
    },
    required: ["url", "goal"],
  },
  requiresConsent: true,
  timeoutMs: 300_000,
  async execute(args, _ctx) {
    const { url, goal, extract } = args;

    if (!url || !goal) {
      return { output: "Error: both 'url' and 'goal' are required", exitCode: 1 };
    }

    const env = readEnvFile();

    if (env.MAGNITUDE_ENABLED !== "true") {
      return {
        output: "Magnitude browser agent is not enabled. Enable it in Settings → Magnitude.",
        exitCode: 1,
      };
    }

    const provider = env.MAGNITUDE_MODEL_PROVIDER || "openai";
    const model = env.MAGNITUDE_MODEL || "gpt-4o";
    const apiKey = env.MAGNITUDE_MODEL_API_KEY || "";
    const baseURL = env.MAGNITUDE_MODEL_BASE_URL || "";
    const proxyUrl = env.MAGNITUDE_PROXY_URL || "";
    const headless = env.MAGNITUDE_HEADLESS !== "false";
    const displayPort = env.MAGNITUDE_DISPLAY || "";

    if (!apiKey) {
      return {
        output: "No API key configured for the Browser Agent. Configure a model in Settings → Browser Agent.",
        exitCode: 1,
      };
    }

    if (!headless && displayPort) {
      process.env.DISPLAY = displayPort.startsWith(":") ? displayPort : `:${displayPort}`;
    }

    const PROVIDER_MAP: Record<string, string> = {
      anthropic: "anthropic",
      openai: "openai",
      google: "google-ai",
      "openai-compatible": "openai-generic",
    };
    const magnitudeLlmProvider = PROVIDER_MAP[provider] || "openai";

    try {
      const { startBrowserAgent } = await import("magnitude-core");

      const launchOptions: any = { headless };
      if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
      }
      if (!headless && displayPort) {
        const display = displayPort.startsWith(":") ? displayPort : `:${displayPort}`;
        launchOptions.env = { ...process.env, DISPLAY: display };
      }

      const agentConfig: any = {
        url,
        narrate: true,
        browser: {
          launchOptions,
          contextOptions: { ignoreHTTPSErrors: true },
        },
        llm: {
          provider: magnitudeLlmProvider,
          options: {
            model,
            apiKey,
            ...(baseURL ? { baseUrl: baseURL } : {}),
          },
        },
      };

      const agent = await startBrowserAgent(agentConfig);

      try {
        await agent.act(goal);

        let extractedData = "";
        if (extract) {
          const data = await agent.extract(extract, z.record(z.any()));
          extractedData = `\n\nExtracted data:\n${JSON.stringify(data, null, 2)}`;
        }

        await agent.stop();

        return {
          output: `Browser agent completed successfully.\nGoal: ${goal}\nURL: ${url}${extractedData}`,
          exitCode: 0,
        };
      } catch (agentError: any) {
        try { await agent.stop(); } catch {}
        return {
          output: `Browser agent failed during execution: ${agentError.message}`,
          exitCode: 1,
        };
      }
    } catch (err: any) {
      return {
        output: `Failed to start Magnitude browser agent: ${err.message}`,
        exitCode: 1,
      };
    }
  },
};

export default magnitudeBrowser;

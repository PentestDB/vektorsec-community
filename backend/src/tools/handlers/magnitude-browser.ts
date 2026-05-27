import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";
import { formatMagnitudeError } from "../../utils/magnitudeError";
import { presetToProviderConfig } from "../../utils/llm/providers";
import { getAssignedModels } from "../../utils/modelRegistryStore";
import { resolveMagnitudeLlmConfig } from "../../utils/magnitudeLlm";
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
        description:
          "The target URL to navigate to before performing the action",
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
      return {
        output: "Error: both 'url' and 'goal' are required",
        exitCode: 1,
      };
    }

    const env = readEnvFile();

    if (env.MAGNITUDE_ENABLED !== "true") {
      return {
        output:
          "Magnitude browser agent is not enabled. Enable it in Settings -> Browser Agent.",
        exitCode: 1,
      };
    }

    const browserModel = getAssignedModels().browser;
    if (!browserModel) {
      return {
        output:
          "No Browser Agent model selected. Assign one in Settings -> Models.",
        exitCode: 1,
      };
    }

    const providerConfig = await presetToProviderConfig(browserModel);
    const { apiKey } = providerConfig;
    const proxyUrl = env.MAGNITUDE_PROXY_URL || "";
    const headless = env.MAGNITUDE_HEADLESS !== "false";
    const display = env.MAGNITUDE_DISPLAY || process.env.DISPLAY || ":99";
    const normalizedDisplay = display.startsWith(":") ? display : `:${display}`;

    if (!apiKey) {
      return {
        output:
          "The selected Browser Agent model has no API key. Configure it in Settings → Models.",
        exitCode: 1,
      };
    }

    // Always ensure DISPLAY is set for the process
    process.env.DISPLAY = normalizedDisplay;

    try {
      const { startBrowserAgent } = await import("magnitude-core");
      const llm = resolveMagnitudeLlmConfig(providerConfig);

      const launchOptions: any = { headless };
      if (proxyUrl) {
        launchOptions.proxy = { server: proxyUrl };
      }
      if (!headless) {
        launchOptions.env = { ...process.env, DISPLAY: normalizedDisplay };
      }

      const agentConfig: any = {
        url,
        narrate: true,
        browser: {
          launchOptions,
          contextOptions: { ignoreHTTPSErrors: true },
        },
        llm: {
          provider: llm.provider,
          options: llm.options,
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
        try {
          await agent.stop();
        } catch {}
        return {
          output: `Browser agent failed during execution: ${formatMagnitudeError(agentError)}`,
          exitCode: 1,
        };
      }
    } catch (err: any) {
      return {
        output: `Failed to start Magnitude browser agent: ${formatMagnitudeError(err)}`,
        exitCode: 1,
      };
    }
  },
};

export default magnitudeBrowser;

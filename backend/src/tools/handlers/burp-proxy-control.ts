import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";

const burpProxyControl: ToolDefinition = {
  name: "burp_proxy_control",
  description:
    "Control Burp Suite's proxy interception. " +
    'Use action "status" to check if intercept is currently enabled, ' +
    '"enable" to turn intercept on, or "disable" to turn it off. ' +
    "Useful when you need requests to flow through without being held by Burp's interceptor.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "enable", "disable"],
        description: '"status" checks current state, "enable" turns intercept on, "disable" turns it off.',
      },
    },
    required: ["action"],
  },
  timeoutMs: 15_000,
  async execute(args, _ctx) {
    const { action } = args;

    const env = readEnvFile();
    const connHost = env.BURP_RPC_HOST;
    const connPort = parseInt(env.BURP_RPC_PORT || "50051", 10);

    if (!connHost) {
      return {
        output: "Error: Burp RPC is not configured. Set BURP_RPC_HOST and BURP_RPC_PORT in Settings.",
        exitCode: 1,
      };
    }

    try {
      const { BurpClient } = await import("burp-rpc");
      const burp = new BurpClient({ host: connHost, port: connPort });

      try {
        if (action === "status") {
          const enabled = await burp.proxy.isInterceptEnabled();
          return {
            output: `Burp proxy intercept is currently ${enabled ? "ENABLED" : "DISABLED"}.`,
            exitCode: 0,
          };
        }

        if (action === "enable") {
          await burp.proxy.setIntercept(true);
          return { output: "Burp proxy intercept has been ENABLED.", exitCode: 0 };
        }

        if (action === "disable") {
          await burp.proxy.setIntercept(false);
          return { output: "Burp proxy intercept has been DISABLED.", exitCode: 0 };
        }

        return { output: `Error: Unknown action "${action}". Use "status", "enable", or "disable".`, exitCode: 1 };
      } finally {
        burp.close();
      }
    } catch (err: any) {
      if (err?.code === 14) {
        return {
          output: `Error: Could not connect to Burp Suite at ${connHost}:${connPort}.`,
          exitCode: 1,
        };
      }
      return { output: `Error controlling proxy: ${err.message}`, exitCode: 1 };
    }
  },
};

export default burpProxyControl;

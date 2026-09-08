#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.PENTEST_COPILOT_MCP_URL || "http://localhost:8081/mcp";
const token = process.env.PENTEST_COPILOT_MCP_TOKEN;

if (!token) {
  console.error("PENTEST_COPILOT_MCP_TOKEN is required.");
  process.exit(1);
}

const client = new Client(
  { name: "vektorsec-smoke", version: "1.0.0" },
  { capabilities: {} },
);

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  console.log(`Connected to ${url}`);
  console.log(`Tools (${toolNames.length}): ${toolNames.join(", ")}`);

  const health = await client.callTool({
    name: "platform_health",
    arguments: { component: "all" },
  });
  const text = health.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  console.log("\nplatform_health:");
  console.log(text || JSON.stringify(health, null, 2));

  await client.close();
} catch (error) {
  console.error("MCP smoke test failed:");
  console.error(error?.stack || error?.message || error);
  try {
    await client.close();
  } catch {}
  process.exit(1);
}

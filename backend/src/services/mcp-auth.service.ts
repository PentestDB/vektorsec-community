import crypto from "crypto";
import UserModel, { McpTokenDoc, UserDoc } from "../models/User/User.model";

const MCP_TOKEN_PREFIX = "pc_mcp_";
const DEFAULT_TOKEN_LABEL = "Universal MCP Token";

function stableStringCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function generateMcpTokenValue(): string {
  return `${MCP_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

export function buildMcpEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/mcp`;
}

export function buildMcpConfigTemplate(baseUrl: string, token: string): string {
  return [
    "name: pentest-copilot",
    "transport:",
    "  type: http",
    `  url: ${buildMcpEndpoint(baseUrl)}`,
    "auth:",
    "  type: bearer",
    `  token: ${token}`,
  ].join("\n");
}

export function buildMcpEnvTemplate(baseUrl: string, token: string): string {
  return [
    `PENTEST_COPILOT_MCP_URL=${buildMcpEndpoint(baseUrl)}`,
    `PENTEST_COPILOT_MCP_TOKEN=${token}`,
  ].join("\n");
}

export function createMcpTokenDoc(label?: string): McpTokenDoc {
  const token = generateMcpTokenValue();
  return {
    tokenId: crypto.randomUUID(),
    label: (label || DEFAULT_TOKEN_LABEL).trim() || DEFAULT_TOKEN_LABEL,
    token,
    createdAt: new Date(),
    lastUsedAt: undefined,
    revokedAt: null,
  };
}

export async function ensureDefaultMcpToken(
  user: UserDoc,
): Promise<McpTokenDoc> {
  const existing = (user.configs.mcpTokens || []).find(
    (token) => !token.revokedAt,
  );
  if (existing) return existing;

  const created = createMcpTokenDoc(DEFAULT_TOKEN_LABEL);
  user.configs.mcpTokens = [...(user.configs.mcpTokens || []), created];
  await user.save();
  return created;
}

export async function createMcpToken(
  user: UserDoc,
  label?: string,
): Promise<McpTokenDoc> {
  const created = createMcpTokenDoc(label);
  user.configs.mcpTokens = [...(user.configs.mcpTokens || []), created];
  await user.save();
  return created;
}

export async function revokeMcpToken(
  user: UserDoc,
  tokenId: string,
): Promise<boolean> {
  const tokens = user.configs.mcpTokens || [];
  const token = tokens.find(
    (candidate) => candidate.tokenId === tokenId && !candidate.revokedAt,
  );
  if (!token) return false;
  token.revokedAt = new Date();
  await user.save();
  return true;
}

export function listActiveMcpTokens(user: UserDoc): McpTokenDoc[] {
  return (user.configs.mcpTokens || []).filter((token) => !token.revokedAt);
}

export async function findUserByMcpToken(
  token: string,
): Promise<{ user: UserDoc; token: McpTokenDoc } | null> {
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) return null;
  const user = await UserModel.findOne({
    "configs.mcpTokens": {
      $elemMatch: {
        token,
        revokedAt: null,
      },
    },
  });

  if (!user) return null;

  const matched = (user.configs.mcpTokens || []).find(
    (candidate) =>
      !candidate.revokedAt && stableStringCompare(candidate.token, token),
  );

  if (!matched) return null;
  return { user, token: matched };
}

export async function touchMcpTokenUsage(
  user: UserDoc,
  tokenId: string,
): Promise<void> {
  await UserModel.updateOne(
    { _id: user._id, "configs.mcpTokens.tokenId": tokenId },
    { $set: { "configs.mcpTokens.$.lastUsedAt": new Date() } },
  );
}

import { NextFunction, Request, Response } from "express";
import { findUserByMcpToken, touchMcpTokenUsage } from "../services/mcp-auth.service";

export async function verifyMcpToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    return res.status(401).json({
      error: "missing_bearer_token",
      message: "Authorization: Bearer <token> is required",
    });
  }

  const result = await findUserByMcpToken(token);
  if (!result) {
    return res.status(401).json({
      error: "invalid_mcp_token",
      message: "The supplied MCP token is invalid or revoked",
    });
  }

  res.locals.user = result.user;
  res.locals.userId = result.user._id.toString();
  res.locals.mcpTokenId = result.token.tokenId;

  await touchMcpTokenUsage(result.user, result.token.tokenId);
  next();
}

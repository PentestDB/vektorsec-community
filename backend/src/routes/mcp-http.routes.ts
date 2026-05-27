import express, { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyMcpToken } from "../middlewares/VerifyMcpToken.middleware";
import { buildMcpServerForUser, getMcpHostValidationMiddleware } from "../services/mcp-tools.service";

const router = express.Router();

router.use(getMcpHostValidationMiddleware());
router.use(verifyMcpToken);

async function handleMcpRequest(req: Request, res: Response) {
  const user = res.locals.user;
  const server = buildMcpServerForUser(user);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp] transport error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal MCP server error",
        },
        id: null,
      });
    }
  } finally {
    void transport.close();
    void server.close();
  }
}

router.post("/", handleMcpRequest);
router.get("/", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "GET is not supported for this stateless MCP endpoint.",
    },
    id: null,
  });
});
router.delete("/", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "DELETE is not supported for this stateless MCP endpoint.",
    },
    id: null,
  });
});

export { router as mcpHttpRoutes };

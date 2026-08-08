import { Router } from "express";
import { Request, Response } from "express";
import {
  buildPayloadUrls,
  createOobPayload,
  extractOobTokenFromHost,
  isValidOobToken,
  OobInteractionInput,
  pollOobInteractions,
  recordOobInteraction,
} from "../services/oob.service";

const router = Router();

function interactionFromReq(req: Request): OobInteractionInput {
  let bodyPreview = "";
  if (typeof req.body === "string") {
    bodyPreview = req.body;
  } else if (req.body && typeof req.body === "object") {
    bodyPreview = JSON.stringify(req.body);
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key] = String(value);
  }
  return {
    type: "http",
    method: req.method,
    path: req.originalUrl || req.path || "/",
    protocol: req.protocol,
    host: req.headers.host,
    remoteAddress: req.ip || req.socket?.remoteAddress,
    headers,
    bodyPreview,
  };
}

/**
 * Host-header token style: <token>.oob.<domain>
 * Catches requests to ANY path on the server whose Host carries a valid OOB
 * subdomain token. Enables real DNS/HTTP out-of-band detection when wildcard
 * DNS (*.oob.<domain>) points at this server.
 */
router.use((req: Request, res: Response, next) => {
  const token = extractOobTokenFromHost(req.headers.host);
  if (token && isValidOobToken(token)) {
    recordOobInteraction(token, interactionFromReq(req)).catch((err) =>
      console.error("[oob] failed to record host interaction:", err),
    );
    return res.status(200).json({ ok: true });
  }
  next();
});

/** Path-based callback — works without any DNS setup. */
const recordCallback = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!isValidOobToken(token)) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }
  recordOobInteraction(token, interactionFromReq(req)).catch((err) =>
    console.error("[oob] failed to record callback:", err),
  );
  return res.status(200).json({ ok: true });
};

router.get("/callback/:token", recordCallback);
router.post("/callback/:token", recordCallback);
router.all("/callback/:token", recordCallback);

/** Generate a payload. Returns full URLs based on the request host. */
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const label = String(req.body?.label || "").trim() || undefined;
    const info = await createOobPayload(label);
    const baseUrl = `${req.protocol}://${req.headers.host}`;
    return res.status(201).json({
      ...info,
      ...buildPayloadUrls(baseUrl, info.token),
      interactionCount: 0,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to generate OOB payload" });
  }
});

/** Poll interactions for a token. */
const poll = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!isValidOobToken(token)) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }
  const { interactions, info } = await pollOobInteractions(token);
  return res.status(200).json({
    token,
    info,
    interactions,
    interactionCount: interactions.length,
  });
};

router.get("/poll/:token", poll);
router.post("/poll/:token", poll);

export { router as oobRoutes };

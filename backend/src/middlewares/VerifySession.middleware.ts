import { Response, NextFunction, Request } from "express";
import UserModel from "../models/User/User.model";
import EarlyAccessModel from "../models/EarlyAccess/EarlyAccess.model";
import getSecrets from "../utils/getSecrets";
import {
  clearSessionCookie,
  destroySession,
  isSessionVersionStale,
} from "../services/session.auth";

/**
 * True when the caller looks like a browser navigation rather than an API
 * client. Only explicit HTML requests (and non-AJAX form posts) are redirected;
 * everything else gets a JSON 401 so API clients, mobile apps and the
 * black-box gateway can react to the status code.
 */
function wantsHtml(req: Request): boolean {
  const requestedWith = req.headers["x-requested-with"];
  if (typeof requestedWith === "string" && requestedWith.toLowerCase() === "xmlhttprequest") {
    return false;
  }

  const accept = String(req.headers.accept ?? "");
  if (accept.includes("application/json")) return false;
  return accept.includes("text/html");
}

export const verifySess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session) {
    return res.status(403).send({ message: "Session not provided!" });
  }

  const session = req.session; // cookie

  const BASE_URL_FRONTEND = await getSecrets("BASE_URL_FRONTEND");

  if (session.user == null) {
    if (wantsHtml(req)) {
      res.redirect(`${BASE_URL_FRONTEND}/login`);
      return;
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = session.user.userId;

  const user = await UserModel.findOne({
    _id: userId?.toString(),
  });

  if (!user) {
    await destroySession(req);
    clearSessionCookie(res);
    return res.status(403).send({ message: "User not found" });
  }

  // A blocked account must lose access immediately, not on the next login.
  if ((user as any).isBlocked) {
    await destroySession(req);
    clearSessionCookie(res);
    if (wantsHtml(req)) {
      res.redirect(`${BASE_URL_FRONTEND}/login`);
      return;
    }
    return res.status(403).json({
      message: "This account has been blocked. Contact your administrator.",
      code: "ACCOUNT_BLOCKED",
    });
  }

  // Revocation: a password reset, an admin block or "log out everywhere" bumps
  // the user's version, which invalidates every session issued before it.
  if (isSessionVersionStale(session.sessionVersion, (user as any).sessionVersion)) {
    await destroySession(req);
    clearSessionCookie(res);
    if (wantsHtml(req)) {
      res.redirect(`${BASE_URL_FRONTEND}/login`);
      return;
    }
    return res.status(401).json({
      message: "Your session is no longer valid. Please sign in again.",
      code: "SESSION_REVOKED",
    });
  }

  res.locals.userId = userId;
  res.locals.user = user;

  next();
};

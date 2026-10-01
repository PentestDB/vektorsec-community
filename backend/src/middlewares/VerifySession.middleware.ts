import { Response, NextFunction, Request } from "express";
import UserModel from "../models/User/User.model";
import EarlyAccessModel from "../models/EarlyAccess/EarlyAccess.model";
import getSecrets from "../utils/getSecrets";

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
    return res.status(403).send({ message: "User not found" });
  }

  res.locals.userId = userId;
  res.locals.user = user;

  next();
};

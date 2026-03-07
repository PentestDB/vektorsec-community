import { Response, NextFunction, Request } from "express";
import UserModel from "../models/User/User.model";
import EarlyAccessModel from "../models/EarlyAccess/EarlyAccess.model";
import getSecrets from "../utils/getSecrets";

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
    res.redirect(`${BASE_URL_FRONTEND}/login`);
    return;
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

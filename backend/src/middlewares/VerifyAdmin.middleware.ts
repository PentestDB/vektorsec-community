import { Response, NextFunction, Request } from "express";
import UserModel from "../models/User/User.model";

export const verifyAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.session) {
    return res.status(403).send({ message: "Session not provided!" });
  }

  const session = req.session;

  if (session.user == null) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const userId = session.user.userId;

  const user = await UserModel.findOne({
    _id: userId?.toString(),
  });

  if (!user) {
    return res.status(403).send({ message: "User not found" });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  res.locals.userId = userId;
  res.locals.user = user;

  next();
};

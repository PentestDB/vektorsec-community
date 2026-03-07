import SessionsModel from "../models/Sessions/Sessions.model";
import { Response } from "express";

export async function getActiveSession(userId: string, sessionId: string) {
  return SessionsModel.findOne({
    sessionId,
    uid: userId,
    status: "active",
  });
}

export async function requireActiveSession(
  userId: string,
  sessionId: string,
  res: Response
) {
  const session = await getActiveSession(userId, sessionId);
  if (!session) {
    res.status(400).json({ message: "Session not found" });
    return null;
  }
  return session;
}

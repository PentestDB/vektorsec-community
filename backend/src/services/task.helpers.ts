import ServiceTaskModel from "../models/ServiceTask/ServiceTask.model";

export async function getUserContainerIp(userId: string): Promise<string | null> {
  const task = await ServiceTaskModel.findOne({
    uid: userId,
    status: { $in: ["pending", "running"] },
    containerIp: { $exists: true },
  });

  return task?.containerIp ?? null;
}

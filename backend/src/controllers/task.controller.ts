import { Response, Request } from "express";
import ServiceTaskModel from "../models/ServiceTask/ServiceTask.model";
import UserModel from "../models/User/User.model";
import SessionsModel from "../models/Sessions/Sessions.model";
import getSecrets from "../utils/getSecrets";
import { requireActiveSession } from "../services/session.helpers";
import Docker from "dockerode";

const docker = new Docker(); // Uses default socket (/var/run/docker.sock)

export const startupNewTask = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session ID",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;

    const previousServiceTask = await ServiceTaskModel.find({
      uid: userId,
      status: { $ne: "stopped" },
    });

    if (previousServiceTask.length > 0) {
      return res.status(400).json({
        message: "Exploit Box with another session is already running",
        description:
          "Please stop the previous exploit box before starting a new one",
      });
    }

    const sameBoxTask = previousServiceTask.find(
      (task) => task._id === session.boxId
    );

    if (sameBoxTask) {
      return res.status(200).json({
        message: "You already have a running container",
        serviceId: sameBoxTask.serviceId,
      });
    }

    const totalNumOfRunningEC2 = await ServiceTaskModel.countDocuments({
      status: { $ne: "stopped" },
    });

    const MAX_EC2_INSTANCE_COUNT = await getSecrets("MAX-EC2-INSTANCE-COUNT");

    const MAX_EC2_INSTANCE = parseInt(MAX_EC2_INSTANCE_COUNT ?? "5");

    if (totalNumOfRunningEC2 >= MAX_EC2_INSTANCE) {
      return res.status(400).json({
        message:
          "Currently at max capacity, please try again later after 30 minutes",
      });
    }

    const randomServiceID = Math.random().toString(36).substring(7);

    const vmName = `exploitbox-vm-${randomServiceID}`;
    const serviceTask = new ServiceTaskModel({
      serviceId: randomServiceID,
      sessionId: session._id,
      uid: userId,
      vmName: vmName,
      status: "pending",
      expiresAt: new Date(Date.now() + 65 * 60 * 1000),
    });

    await serviceTask.save();

    session.boxId = serviceTask._id;

    await session.save();

    // Return response immediately
    return res.status(200).json({ serviceId: randomServiceID });
  } catch (err: any) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to start exploit box, please try again later",
    });
  }
};

export const exploitBoxStatus = async (req: Request, res: Response) => {
  const user = res.locals.user;
  const userId = res.locals.userId;

  const { sessionId } = req.params;

  try {
    if (!sessionId) {
      return res.status(400).json({
        message: "Invalid session ID",
      });
    }

    const session = await requireActiveSession(userId, sessionId, res);
    if (!session) return;
    
    // Find the Kali container by looking for containers with "kali" in the name
    const containers = await docker.listContainers();
    const kaliContainer = containers.find(container => 
      container.Names && container.Names.some(name => 
        name.toLowerCase().includes('kali')
      )
    );
    
    if (!kaliContainer) {
      const sshHost = (process.env.SSH_HOST || "").trim();
      if (sshHost) {
        return res.status(200).json({
          success: true,
          message: "Exploit Box is running (local SSH)",
          status: "running",
          readyToConnect: true,
          containerIP: sshHost,
          type: "local",
        });
      }
      return res.status(200).json({
        message: "Exploit Box is not running",
        success: false,
      });
    }
    
    const container = docker.getContainer(kaliContainer.Id);
    let containerInfo;
    try {
      containerInfo = await container.inspect();
    } catch (err: any) {
      return res.status(200).json({
        message: "Exploit Box is not running",
        success: false,
      });
    }

    // containerInfo.State.Status can be "running", "exited", etc.
    const containerStatus = containerInfo.State.Status;
    const readyToSSH = containerStatus === "running";

    // Optionally, get the container IP from the network settings
    const containerIP =
      containerInfo.NetworkSettings && containerInfo.NetworkSettings.IPAddress
        ? containerInfo.NetworkSettings.IPAddress
        : "N/A";

    return res.status(200).json({
      success: true,
      message: `Exploit Box is ${containerStatus}`,
      status: containerStatus,
      readyToConnect: readyToSSH,
      containerIP,
    });

    // return res.status(200).json({
    //   success: true,
    //   message: "Exploit box is running",
    //   status: runningServiceTask.status,
    //   serviceId: runningServiceTask.serviceId,
    //   expiresAt: runningServiceTask.expiresAt,
    //   extends: maxExtend - runningServiceTask.extends,
    //   cpuUtilization: runningServiceTask.infraInfo.cpuUtilization,
    //   readyToConnect: readyToSSH,
    //   containerIP: runningServiceTask.containerIp,
    // });
  } catch (err: any) {
    console.log("Failed to check exploit box status:", err.message);
    return res.status(400).json({
      message: "Task not found",
      success: false,
    });
  }
};

export const extendTaskExpiration = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { serviceId } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        message: "Service not found",
      });
    }

    const serviceTask = await ServiceTaskModel.findOne({
      serviceId,
      uid: userId,
      status: { $ne: "stopped" },
    });

    if (!serviceTask) {
      return res.status(400).json({
        message: "Task not found",
      });
    }

    if (serviceTask.extends >= 3) {
      return res.status(400).json({
        message: "Maximum extension limit reached",
      });
    }

    const session = await SessionsModel.findOne({
      uid: userId,
      boxId: serviceTask._id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    // expiresAt + 30 minutes
    serviceTask.expiresAt = new Date(
      serviceTask.expiresAt.getTime() + 30 * 60 * 1000
    );

    serviceTask.extends = serviceTask.extends + 1;

    await serviceTask.save();

    return res.status(200).json({
      message: "Task expiration extended successfully!",
      success: true,
      extends: serviceTask.extends,
      expiresAt: serviceTask.expiresAt,
    });
  } catch (err) {
    return res.status(400).json({
      message: "Failed to extend task expiration",
      success: false,
    });
  }
};

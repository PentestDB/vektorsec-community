import { Response, Request } from "express";
import {
  getSessionData,
  storeSession,
  storeNetcatSession,
  getNetcatSession,
  storeNetcatOutput,
  storeNetcatInput,
  changeNetcatSessionStatus,
  getNetcatSessionOutput,
  updateNetcatSession,
} from "../utils/redis/store";
import { v4 as uuidv4 } from "uuid";
import { execSSHCommand } from "../services/ssh.service";

const netcatOperations = {
  async start(params: { ip: string; port: any; netcat_id: any }) {
    const output = await execSSHCommand(`nohup nc -nlvp ${params.port} > /tmp/nc_${params.netcat_id}.log 2>&1 &`);
    return { running_port: params.port, output };
  },
  async sendInput(params: { ip: string; netcat_id: any; input: string }) {
    return execSSHCommand(`echo "${params.input}" >> /tmp/nc_input_${params.netcat_id}`);
  },
  async stop(params: { ip: string; netcat_id: any }) {
    return execSSHCommand(`kill $(lsof -t -i:${params.netcat_id}) 2>/dev/null || true`);
  },
};
import { requireActiveSession } from "../services/session.helpers";
import { getUserContainerIp } from "../services/task.helpers";
import { initNetcatSession } from "../services/session.services";

export const initiateNetcat = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { access, session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

    const mainSessionId = session_id;

    const mainSession = session;

    // const hasExploitBox = await checkIfUserHasRunningExploitBox(
    //   user._id,
    //   mainSession._id
    // );

    // if (!hasExploitBox) {
    //   return res.status(400).json({
    //     message: "Exploit Box is not running",
    //   });
    // }

    const netcatId = uuidv4().toString();

    await storeNetcatSession({
      netcat_id: netcatId,
      session_id: session_id,
    });

    const sessionData = await getSessionData(session_id);

    if (!sessionData) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const history = sessionData.history;

    history.push({
      role: "user",
      content: "Netcat session started",
      isContextual: true,
      loopStep: 2,
    });

    if (access === "direct") {
      await storeSession({
        sessionId: session_id,
        uid: userId,
      });
    } else {
      await storeSession({
        sessionId: session_id,
        history: history,
        uid: userId,
      });
    }

    await initNetcatSession(session_id);

    return res.status(200).json({
      message: "Netcat session initiated successfully!",
      netcatId: netcatId,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to initiate netcat session",
    });
  }
};

export const getNetcatData = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { netcat_id } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Netcat Id not found",
      });
    }

    const netcatSession: any = await getNetcatSession(netcat_id);

    if (!netcatSession) {
      return res.status(400).json({
        message: "Netcat session not found",
      });
    }

    return res.status(200).json({
      message: "Netcat Session Found",
      data: netcatSession,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to get netcat session data",
    });
  }
};

export const startNetcat = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { netcat_id, session_id, port } = req.body;

    if (!port) {
      return res.status(400).json({
        message: "Invalid port",
      });
    }

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    await updateNetcatSession({
      netcat_id: netcat_id,
      session_id: session_id,
      port: port,
    });

    const containerIp = await getUserContainerIp(userId);

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const netcatSession = await getNetcatSession(netcat_id);

    if (!netcatSession) {
      return res.status(400).json({
        message: "Netcat session not found",
      });
    }

    const data = await netcatOperations.start({
      ip: containerIp,
      port: netcatSession.port,
      netcat_id: netcat_id,
    });

    await changeNetcatSessionStatus({
      netcat_id,
      status: "started",
      session_id,
    });

    return res.status(200).json({
      message: "Started netcat session",
      running_port: data.running_port,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Error starting netcat session",
    });
  }
};

export const sendNetcatInput = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { netcat_id, input } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    if (!input) {
      return res.status(400).json({
        message: "Invalid input",
      });
    }

    const containerIp = await getUserContainerIp(userId);

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    await storeNetcatInput({ netcat_id, input });

    const response = await netcatOperations.sendInput({
      ip: containerIp,
      netcat_id: netcat_id,
      input: input,
    });

    if (!response) {
      return res.status(400).json({
        message: "Failed to send netcat input",
      });
    }

    return res.status(200).json({
      message: "Netcat input sent successfully!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Error sending netcat input",
    });
  }
};

export const getNetcatOutput = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { netcat_id } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    const output = await getNetcatSessionOutput(netcat_id);

    return res.status(200).json({
      output: output,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to get netcat output",
    });
  }
};

export const storeNetcatOutputData = async (req: Request, res: Response) => {
  try {
    const { netcat_id, output } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    await storeNetcatOutput({ netcatId: netcat_id, output });

    return res.status(200).json({
      message: "Netcat output data stored successfully!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to store netcat output data",
    });
  }
};

export const stopNetcat = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { netcat_id, session_id } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    const containerIp = await getUserContainerIp(userId);

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const response = await netcatOperations.stop({
      ip: containerIp,
      netcat_id: netcat_id,
    });

    if (!response) {
      return res.status(400).json({
        message: "Failed to stop netcat session",
      });
    }

    await changeNetcatSessionStatus({
      netcat_id: netcat_id,
      status: "stopped",
      session_id: session_id,
    });

    return res.status(200).json({
      message: "Netcat session stopped successfully!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to stop netcat session",
    });
  }
};

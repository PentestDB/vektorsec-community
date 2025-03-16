import { Response, Request } from "express";
import ServiceTaskModel from "../models/ServiceTask/ServiceTask.model";
import UserModel from "../models/User/User.model";
import axios from "axios";
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
  getSessionTodoList,
  updateSessionHistory,
  updateSessionTodoList,
} from "../utils/redis/store";
import { v4 as uuidv4 } from "uuid";
import { PluginInventory } from "../services/plugins.services";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import ssh2, { Client } from "ssh2";
import { Client as SSHClient } from "ssh2"; // from "ssh2" library

import getSecrets from "../utils/getSecrets";
import {
  HistoryData,
  completeSessionSubprocess,
  createNewSession,
  createNewSubProcess,
  getNextStepType,
  initNetcatSession,
} from "../services/session.services";
import { CopilotPrompts } from "../utils/copilot/prompts";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require("archiver");
const fs = require("fs");
import path from "path";
// copilot
export const createCopilotSession = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { name, description, engagementType } = req.body;

    if (!name || !["generic", "formal"].includes(engagementType)) {
      return res.status(400).json({
        message: "Session details missing",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const sessionID = await createNewSession({ uid: userId, engagementType });

    const archiveHistory = new HistoryArchiveModel({
      sessionId: sessionID,
      history: [],
    });

    const savedHistory = await archiveHistory.save();

    // trim name to max 50 chars
    // trim description to max 500 chars

    const newSession = new SessionsModel({
      name: name.length > 50 ? name.substring(0, 50) + "..." : name,
      description:
        description?.length > 500
          ? description.substring(0, 500)
          : description ?? "",
      uid: userId,
      createdAt: new Date(),
      sessionId: sessionID,
      type: "main",
      archiveHistoryId: savedHistory._id,
      engagementType,
    });

    await newSession.save();

    return res.status(200).json({
      message: "Workspace created",
      session_id: sessionID,
    });
  } catch (err) {
    console.log("Error creating workspace");
    console.log(err);
    return res.status(400).json({
      message: "Failed to create workspace",
    });
  }
};

export const getCopilotSession = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session ID not found",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const sessionData = await getSessionData(session_id);

    const dbSession = await SessionsModel.findOne({
      sessionId: session_id,
      uid: user._id,
    });

    if (!dbSession) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    let currentStepType;

    const lastLoopHistory =
      dbSession.loopHistory[dbSession.loopHistory.length - 1];

    if (lastLoopHistory) {
      if (lastLoopHistory.status === "pending") {
        currentStepType = lastLoopHistory.stepType;
      } else {
        currentStepType = getNextStepType(lastLoopHistory.stepType);
      }
    }

    let downloadFilesExist = false;

    if (dbSession.boxId) {
      const exploitBox = await ServiceTaskModel.findOne({
        uid: userId,
        status: { $in: ["running"] },
        containerIp: { $exists: true },
      });

      if (exploitBox && downloadFilesExist) {
        let downloadFiles = dbSession.storeCommands
          .filter(
            (command) =>
              command.file_name !== undefined &&
              command.boxId === dbSession.boxId // Only download files from the current running box
          )
          .map((command) => command.file_name);

        downloadFilesExist = downloadFiles.length > 0;
      }
    }

    if (currentStepType === "command") {
      const commands = dbSession.storeCommands.filter(
        (command) => command.active
      );

      const data = {
        message: "Session data",
        ...sessionData,
        isMainThread: dbSession.type === "sub" ? 0 : 1,
        commands,
        downloadExists: downloadFilesExist,
      };

      return res.status(200).json(data);
    }

    return res.status(200).json({
      message: "Session data",
      ...sessionData,
      isMainThread: dbSession.type === "sub" ? 0 : 1,
      downloadExists: downloadFilesExist,
    });
  } catch (err) {
    console.log("Error getting session data");
    console.log(err);
    return res.status(400).json({
      message: "Failed to get copilot session info",
    });
  }
};

export const deleteCopilotSession = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session ID not found",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const sessionData = await SessionsModel.findOne({
      uid: user._id,
      sessionId: session_id,
      status: { $ne: "archived" },
    });

    if (!sessionData) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (sessionData.boxId) {
      const serviceTask = await ServiceTaskModel.findOne({
        _id: sessionData.boxId,
      });
    }
    sessionData.status = "archived";

    await sessionData.save();

    return res.status(200).json({
      message: "Session deleted successfully",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to delete copilot session",
    });
  }
};

export const createCopilotSubprocess = async (req: Request, res: Response) => {
  try {
    const { session_id, commands_list } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      uid: user._id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (session.type !== "main") {
      return res.status(400).json({
        message: "Only allowed create subprocesses from main sessions",
      });
    }

    const subprocess = await createNewSubProcess(session_id);

    for (const process of subprocess) {
      const archiveHistory = new HistoryArchiveModel({
        sessionId: process.id,
        history: [],
      });

      const savedHistory = await archiveHistory.save();

      const subSession = new SessionsModel({
        uid: user._id,
        name: session.name,
        type: "sub",
        boxId: session.boxId,
        createdAt: new Date(),
        sessionId: process.id,
        description: session.description,
        archiveHistoryId: savedHistory._id,
        mainSessionId: session_id,
        storeCommands: [
          {
            plugin_name: process.command.plugin_name,
            args: process.command.args,
            active: true,
            loop: 0,
          },
        ],
        loopHistory: [
          {
            stepType: "command",
            status: "pending",
            data: {
              content: JSON.stringify({
                commands: [
                  {
                    plugin_name: process.command.plugin_name,
                    args: process.command.args,
                  },
                ],
              }),
            },
            loop: 0,
          },
        ],
        loopStepsPerformed: 0,
        loops: [
          {
            startTimestamp: new Date(),
            loop: 0,
          },
        ],
      });

      await subSession.save();

      const sysInit = await CopilotPrompts.generate_system_init(
        process.id,
        user.configs.tools,
        true
      );

      let subsessionHistory: HistoryData[] = [];

      subsessionHistory.push({
        role: "system",
        content: sysInit,
        loopStep: 0,
        isContextual: false,
      });

      const userPrompt = CopilotPrompts.subsession_init_userprompt(
        process.context.summary,
        process.context.nextSteps
      );

      subsessionHistory.push({
        role: "user",
        content: userPrompt,
        loopStep: 0,
        isContextual: true,
      });

      subsessionHistory.push({
        role: "assistant",
        content:
          JSON.stringify(process.command) ??
          "We should focus on recon for the target",
        loopStep: 0,
        isContextual: true,
      });

      await updateSessionHistory({
        sessionId: process.id,
        history: subsessionHistory,
      });
    }

    return res.status(200).json({
      message: "Subprocess created successfully!",
      subprocess,
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to create subprocess",
    });
  }
};

export const completeCopilotSubprocess = async (
  req: Request,
  res: Response
) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Subprocess session not found",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    let containerIp;

    const previousServiceTask = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $ne: "stopped" },
      containerIp: { $exists: true },
    });

    containerIp = previousServiceTask?.containerIp;

    await completeSessionSubprocess(session_id);

    return res.status(200).json({
      session_id,
      message: "Subprocess completed successfully!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to complete subprocess",
    });
  }
};

export const getUserSessions = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const sessions = await SessionsModel.aggregate([
      {
        $match: {
          uid: user._id,
          type: "main",
          status: { $ne: "archived" },
        },
      },
      {
        $lookup: {
          from: "exploitboxes",
          localField: "boxId",
          foreignField: "_id",
          as: "box",
        },
      },
      {
        $unwind: {
          path: "$box",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          name: 1,
          sessionId: 1,
          description: 1,
          createdAt: 1,
          boxStatus: "$box.status",
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    return res.status(200).json(sessions);
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to get user sessions",
    });
  }
};

export const getSessionInfo = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      uid: userId,
      sessionId: session_id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const sessionData = await getSessionData(session_id);
    return res.status(200).json({
      sessionName: session.name,
      sessionType: session.type,
      mainSessionId:
        session.type === "sub" ? sessionData?.mainSessionId : session_id,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get session info",
    });
  }
};

export const getSessionHistory = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const dbSession = await SessionsModel.findOne({
      sessionId: session_id,
      uid: user._id,
    });

    if (!dbSession) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const loopHistory = dbSession.loopHistory;

    const currentStep = loopHistory[loopHistory.length - 1]?.stepType ?? "init";

    const currentLoopNumber = dbSession.loopStepsPerformed;

    const cleanedLoopHistory = dbSession.loopHistory.filter(
      (history) => history.loop <= currentLoopNumber
    );

    await SessionsModel.findOneAndUpdate(
      {
        sessionId: session_id,
        uid: user._id,
      },
      {
        $set: {
          loopHistory: cleanedLoopHistory,
        },
      }
    );

    return res.status(200).json({
      loopHistory,
      currentStep,
      currentLoopNumber,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get session history",
    });
  }
};

export const getTodoListSession = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    const { userId } = res.locals;
    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      uid: user._id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const todoList = await getSessionTodoList(session_id);

    const finalTodoList = todoList.map((todo: any) => ({
      step: todo.step,
      title: todo.title,
      status: todo.status,
      substeps: todo.substeps,
    }));

    return res.status(200).json(finalTodoList);
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get session todo list",
    });
  }
};

export const updateTodoListSession = async (req: Request, res: Response) => {
  try {
    const { session_id, todoList } = req.body;

    const { userId } = res.locals;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    // check if todoList is valid JSON
    if (!todoList || !Array.isArray(todoList)) {
      return res.status(400).json({
        message: "Invalid todo list",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      uid: user._id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    await updateSessionTodoList({
      sessionId: session_id,
      todo: todoList,
    });

    return res.status(200).json({
      message: "Session todo list updated successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update session todo list",
    });
  }
};

// Netcat
export const initiateNetcat = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { access, session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      uid: user._id,
      sessionId: session_id,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const mainSessionId =
      session.type === "sub" ? session.mainSessionId : session_id;

    const mainSession = await SessionsModel.findOne({
      sessionId: mainSessionId,
      uid: user._id,
    });

    if (!mainSession) {
      return res.status(400).json({
        message: "Main session not found",
      });
    }

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
    const userId = res.locals.userId;
    const { netcat_id } = req.body;

    if (!netcat_id) {
      return res.status(400).json({
        message: "Netcat Id not found",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "UserId not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
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

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    await updateNetcatSession({
      netcat_id: netcat_id,
      session_id: session_id,
      port: port,
    });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    let containerIp;

    const previousServiceTask = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $ne: "stopped" },
      containerIp: { $exists: true },
    });

    containerIp = previousServiceTask?.containerIp;

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

    const data = await PluginInventory.netcat_listener.start({
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
    const userId = res.locals.userId;
    const { netcat_id, input } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

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

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }
    let containerIp = null;

    const previousServiceTask = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $in: ["pending", "running"] },
      containerIp: { $exists: true },
    });

    containerIp = previousServiceTask?.containerIp;

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    await storeNetcatInput({ netcat_id, input });

    const response = await PluginInventory.netcat_listener.sendInput({
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
    const userId = res.locals.userId;
    const { netcat_id } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
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
    const userId = res.locals.userId;
    const { netcat_id, session_id } = req.body;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (!netcat_id) {
      return res.status(400).json({
        message: "Invalid netcat id",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }
    let containerIp = null;

    const previousServiceTask = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $in: ["pending", "running"] },
      containerIp: { $exists: true },
    });

    containerIp = previousServiceTask?.containerIp;

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const response = await PluginInventory.netcat_listener.stop({
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

// Download

export const downloadCommandFiles = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    let containerIp = null;

    const previousServiceTask = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $in: ["pending", "running"] },
      containerIp: { $exists: true },
    });

    containerIp = previousServiceTask?.containerIp;

    if (!containerIp) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const sessionData = await getSessionData(session_id);

    if (!sessionData) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const dbSessionData = await SessionsModel.findOne({
      uid: user._id,
      sessionId: session_id,
    });

    if (!dbSessionData) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    if (!dbSessionData.boxId) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const exploitBox = await ServiceTaskModel.findOne({
      uid: userId,
      status: { $in: ["running"] },
      containerIp: { $exists: true },
    });

    if (!exploitBox) {
      return res.status(400).json({
        message: "Exploit Box is not running",
      });
    }

    const downloadFilesExist = dbSessionData.storeCommands.length > 0;

    if (!downloadFilesExist) {
      return res.status(400).json({
        message: "No files to download",
      });
    }

    let downloadFiles = dbSessionData.storeCommands
      .filter(
        (command) =>
          command.file_name !== undefined &&
          command.boxId === dbSessionData.boxId // Only download files from the current running box
      )
      .map((command) => command.file_name);

    const flatDownloads = downloadFiles.flat();

    // @TODO Download files from the exploit box and save on s3

    const dlres = await axios.post(
      `http://${containerIp}:5000/api/send_local_files`,
      {
        file_names: flatDownloads,
      }
    );

    if (!dlres || !dlres.data || !dlres.data.output) {
      return res.status(400).json({
        message: "Failed to download files",
      });
    }

    const output = dlres.data.output;

    // Zip the files and send to the frontend
    const zipFileName = `${session_id}.zip`;
    try {
      await zipFiles(output, zipFileName);

      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${zipFileName}`
      );

      // Send the zip file to the frontend
      res.download(zipFileName, (err) => {
        if (err) {
          console.error("Error sending zip file:", err);
          res.status(500).json({
            message: "Failed to send zip file",
          });
        } else {
          // Cleanup: Remove the zip file after sending
          fs.unlinkSync(zipFileName);
        }
      });
    } catch (error) {
      console.error("Error zipping files:", error);
      res.status(500).json({
        message: "Failed to zip files",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to download files",
    });
  }
};

// Function to zip the files
function zipFiles(
  files: { file_name: string; file_binary: Buffer }[],
  zipFileName: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFileName);
    const archive = archiver("zip", {
      zlib: { level: 9 }, // Set compression level
    });

    output.on("close", () => {
      console.log(archive.pointer() + " total bytes");
      console.log(
        "Archiver has been finalized and the output file descriptor has closed."
      );
      resolve(zipFileName);
    });

    archive.on("error", (err: any) => {
      reject(err);
    });

    archive.pipe(output);

    files.forEach((file) => {
      const fileBinary = decodeFileBinary(file.file_binary);
      archive.append(fileBinary, { name: file.file_name });
    });

    archive.finalize();
  });
}

function decodeFileBinary(base64Data: any) {
  return Buffer.from(base64Data, "base64");
}

// OpenVPN
export const uploadOpenVPNforUser = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }
    const file = req.file;
    if (file) {
      if (file.size > 2097152) {
        return res.status(400).json({ message: "file size is too large" });
      }
      const fileBuffer = file.buffer;

      const localFolder = "/kali-data";

      if (!fs.existsSync(localFolder)) {
        fs.mkdirSync(localFolder, { recursive: true });
      }

      const localFilePath = path.join(localFolder, "openvpn.ovpn");
      fs.writeFileSync(localFilePath, fileBuffer);

      return res.status(200).json({
        message: "Upload Complete",
      });
    }

    return res.status(400).json({
      message: "Failed to upload vpn file",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};

export const disconnectVPN = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      status: "active",
      uid: userId,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const ssh = new SSHClient();
    ssh
      .on("ready", () => {
        console.log("SSH connection ready (disconnectVPN)");

        /**
         * Kill the openvpn process.
         * This is a simple approach;
         * you can also do `pkill -SIGTERM openvpn` or something more targeted.
         */
        ssh.exec("pkill openvpn && echo '|<<<<KILLED>>>>|'", (err, stream) => {
          if (err) {
            console.error("Error killing OpenVPN:", err);
            ssh.end();
            return res
              .status(400)
              .json({ message: "Failed to disconnect from VPN" });
          }

          stream.on("close", (code: any, signal: any) => {
            console.log("pkill openvpn command closed", { code, signal });
            ssh.end();

            if (code === 0) {
              return res.status(200).json({ message: "Disconnected from VPN" });
            } else {
              return res
                .status(400)
                .json({ message: "Failed to disconnect VPN" });
            }
          });

          // (Optional) handle stdout/stderr
          stream.on("data", (data: Buffer) => {
            console.log("pkill stdout:", data.toString());
          });
          stream.stderr.on("data", (data: Buffer) => {
            console.error("pkill stderr:", data.toString());
          });
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (disconnectVPN):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect({
        host: "localhost",
        port: 4242,
        username: "root",
        password: "",
      });

  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to disconnect VPN",
    });
  }
};

export const connectToVPN = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const localVPNFilePath = "/kali-data/openvpn.ovpn"
    if (!fs.existsSync(localVPNFilePath)) {
      return res
        .status(400)
        .json({ message: "VPN File does not exist, please upload it first" });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      status: "active",
      uid: userId,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const ssh = new SSHClient();

    ssh
      .on("ready", () => {
        console.log("SSH connection ready (connectToVPN)");

        ssh.exec("openvpn --config /root/openvpn.ovpn --daemon && echo '|<<<<STARTED>>>>|'", (err, stream) => {
          if (err) {
            console.error("Error starting OpenVPN:", err);
            ssh.end();
            return res
              .status(400)
              .json({ message: "Failed to connect to VPN" });
          }

          stream.on("close", (code: any, signal: any) => {
            console.log("OpenVPN start command closed", { code, signal });
            ssh.end();

            if (code === 0) {
              return res.status(200).json({ message: "Connected to VPN" });
            } else {
              return res
                .status(400)
                .json({ message: "Failed to connect to VPN" });
            }
          });

          stream.on("data", (data: Buffer) => {
            console.log("OpenVPN stdout:", data.toString());

          });
          stream.stderr.on("data", (data: Buffer) => {
            console.error("OpenVPN stderr:", data.toString());
          });
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (connectToVPN):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect({
        host: "localhost",
        port: 4242,
        username: "root",
        password: "",
      });

  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};

export const checkUserOpenVPN = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const openVPNFilePath =  "/kali-data/openvpn.ovpn"

    if (!fs.existsSync(openVPNFilePath)) {
      return res.status(400).json({ message: "OpenVPN file not found" });
    }

    return res.status(200).json({
      message: "User openvpn file found",
      openvpnFile: openVPNFilePath,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to check user openvpn file",
    });
  }
};

export const checkVPNStatus = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const session = await SessionsModel.findOne({
      sessionId: session_id,
      status: "active",
      uid: userId,
    });

    if (!session) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const ssh = new SSHClient();
    ssh
      .on("ready", () => {
        console.log("SSH connection ready (checkVPNStatus)");

        /**
         * We can check if there's an `openvpn` process running.
         * If `pgrep` returns a PID, it's running; else it's not.
         */
        ssh.exec("pgrep openvpn", (err, stream) => {
          if (err) {
            console.error("Error checking VPN status:", err);
            ssh.end();
            return res.status(400).json({ message: "Failed to check VPN" });
          }

          let outputData = "";
          let errorData = "";

          stream.on("data", (data: Buffer) => {
            outputData += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            errorData += data.toString();
          });

          stream.on("close", (code: any, signal: any) => {
            ssh.end();
            console.log("pgrep command closed", { code, signal });

            // If code = 0, then openvpn is running (pgrep found a match)
            // If code = 1, no process found
            if (code === 0) {
              return res.status(200).json({
                message: "VPN is running",
                pids: outputData.trim().split("\n"),
                success: true
              });
            } else {
              // pgrep returns 1 if no processes were matched
              return res
                .status(200)
                .json({ message: "VPN is not running", pids: [] });
            }
          });
        });
      })
      .on("error", (err) => {
        console.error("SSH connection error (checkVPNStatus):", err);
        return res.status(400).json({ message: "SSH connection failed" });
      })
      .connect({
        host: "localhost",
        port: 4242,
        username: "root",
        password: "",
      });
  } catch (err) {
    console.log(err);
    return res.status(400).json({
      message: "Failed to upload openvpn file",
    });
  }
};
// VNC
export const getVNCCredentials = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const serverConfig = {
      host: "localhost",
      port: 4242,
      username: "root",
      password: "",
    };


    const sshClient = new ssh2.Client();

    try {
      console.log("Trying to execute VNC commands");
      sshClient
        .on("ready", async () => {
          console.log("SSH connection ready");

            try {

              // 1) Ensure xstartup script starts Xfce (optional if you already have it set in Docker)
              await executeCommand(
                sshClient,
                `mkdir -p ~/.vnc && echo '#!/bin/bash\nxrdb $HOME/.Xresources\nstartxfce4 &' > ~/.vnc/xstartup && chmod +x ~/.vnc/xstartup`
              );
      
              // 2) Kill any leftover VNC servers
              await executeCommand(
                sshClient,
                `for display in {1..9}; do vncserver -kill ":$display" 2>/dev/null || true; done`
              );
      
              // 3) Generate a random VNC password
              const randomPassword = generateRandomPassword();
      
              // 4) Save password into ~/.vnc/passwd
              await executeCommand(
                sshClient,
                `echo '${randomPassword}' | vncpasswd -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd`
              );
      
              // 5) Start a new VNC server on display :1
              await executeCommand(
                sshClient,
                "vncserver -geometry 1280x800 -depth 24 :1"
              );
      
              // 6) Start noVNC on port 80 (inside container)
              const proxyCommand = `websockify --web /usr/share/novnc/ \
                9020 \
                localhost:5901  \
                > /dev/null 2>&1 &`;
              await executeCommand(sshClient, proxyCommand);
      
              console.log("VNC + noVNC server started successfully");
      
              // Small delay to ensure noVNC is fully up
              await new Promise((resolve) => setTimeout(resolve, 1000));
      
              // Return credentials to the client
              // If your Docker is mapping container port 80 -> host port 8080, you might just use "localhost:8080"
              // Or if you're using a domain, use that. For this local example, let's assume host: http://localhost:8080
              const vncURL = "localhost:9020"; // Adjust if you mapped differently
      
              sshClient.end();
      
              return res.status(200).json({
                vncURL,
                password: randomPassword,
              });

          } catch (error) {
            console.log(error);

            return res.status(400).json({
              message: "Failed to get VNC credentials",
            });
          } finally {
            // Close the SSH connection after executing commands
            sshClient.end();
          }
        })

        .on("error", (err: any) => {
          console.log("SSH connection error:", err);

          return res.status(400).json({
            message: "Failed to get VNC credentials",
          });
        });
    } catch (err) {
      console.log("VNC server not started", err);

      return res.status(400).json({
        message: "Failed to get VNC credentials",
      });
    }

    try {
      sshClient.connect(serverConfig);
    } catch (error) {
      console.log("VNC server not started", error);

      return res.status(400).json({
        message: "Failed to get VNC credentials",
      });
    }
  } catch (error) {
    console.log(error);

    return res.status(400).json({
      message: "Failed to get VNC credentials",
    });
  }
};

export async function executeCommand(
  sshClient: Client,
  command: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    sshClient.exec(command, (err, stream) => {
      if (err) {
        console.error("Error executing command:", err);
        reject(err);
        return;
      }

      stream
        .on("close", () => {
          console.log("Command execution completed.");
          resolve();
        })
        .on("data", (data: any) => {
          console.log("STDOUT:", data.toString());
        });
    });
  });
}

export function generateRandomPassword() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";

  // 8 characters
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return password;
}

export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    if (!userId) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    let creditLow, exploitBoxLow;

    if (user.billing.plan === "FREE") {
      const { credits, exploitBox } = user;

      const netCredit = credits.remainingCredits - credits.usedCredits;

      creditLow = credits.remainingCredits
        ? netCredit / credits.remainingCredits <= 0.2
        : false;

      const netExploitBox = exploitBox.remainingHours - exploitBox.usedHours;

      exploitBoxLow = exploitBox.remainingHours
        ? netExploitBox / exploitBox.remainingHours <= 0.2
        : false;
    }

    return res.status(200).json({
      creditLow,
      exploitBoxLow,
      name: user.name,
      email: user.email,
      plan: user.billing.plan,
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get user gold",
    });
  }
};

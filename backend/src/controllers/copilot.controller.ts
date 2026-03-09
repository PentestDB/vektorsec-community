import { Response, Request } from "express";
import ServiceTaskModel from "../models/ServiceTask/ServiceTask.model";

import axios from "axios";
import {
  getSessionData,
  getSessionTodoList,
  updateSessionHistory,
  updateSessionTodoList,
} from "../utils/redis/store";
import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";

import {
  HistoryData,
  completeSessionSubprocess,
  createNewSession,
  createNewSubProcess,
  getNextStepType,
} from "../services/session.services";
import { requireActiveSession } from "../services/session.helpers";
import { getUserContainerIp } from "../services/task.helpers";
import { CopilotPrompts } from "../utils/copilot/prompts";
import { zipFiles } from "../utils/fileUtils";

const fs = require("fs");

// copilot
export const createCopilotSession = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Session details missing",
      });
    }

    const sessionID = await createNewSession({ uid: userId });

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

    const user = res.locals.user;
    const userId = res.locals.userId;

    const sessionData = await getSessionData(session_id);

    const dbSession = await requireActiveSession(userId, session_id, res);
    if (!dbSession) return;

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

      if (exploitBox) {
        let downloadFiles = dbSession.storeCommands
          .filter(
            (command) =>
              command.file_name !== undefined &&
              command.boxId === dbSession.boxId
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

    const user = res.locals.user;
    const userId = res.locals.userId;

    const sessionData = await requireActiveSession(userId, session_id, res);
    if (!sessionData) return;

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

    const user = res.locals.user;
    const userId = res.locals.userId;

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

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
            tool_name: process.command.tool_name,
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
                    tool_name: process.command.tool_name,
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

      const capConfig = {
        tools: user.configs.tools,
        capabilities: user.configs.capabilities ?? [],
        installedCapabilities: user.configs.installedCapabilities ?? [],
      };
      const sysInit = await CopilotPrompts.generate_system_init(
        process.id,
        user.configs.tools,
        true,
        capConfig
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

    const user = res.locals.user;
    const userId = res.locals.userId;

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
    const user = res.locals.user;
    const userId = res.locals.userId;

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

    const user = res.locals.user;
    const userId = res.locals.userId;

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

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

    const user = res.locals.user;
    const userId = res.locals.userId;

    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const dbSession = await requireActiveSession(userId, session_id, res);
    if (!dbSession) return;

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
    const user = res.locals.user;
    const userId = res.locals.userId;
    if (!session_id) {
      return res.status(400).json({
        message: "Session not found",
      });
    }

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

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

    const user = res.locals.user;
    const userId = res.locals.userId;

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

    const session = await requireActiveSession(userId, session_id, res);
    if (!session) return;

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

// Download

export const downloadCommandFiles = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        message: "Invalid session id",
      });
    }

    const user = res.locals.user;
    const userId = res.locals.userId;

    const containerIp = await getUserContainerIp(userId);

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

    const dbSessionData = await requireActiveSession(userId, session_id, res);
    if (!dbSessionData) return;

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


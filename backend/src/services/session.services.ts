import {
  clearCommandFromSubprocess,
  clearSessionSubprocesses,
  completeSubprocess,
  getSessionData,
  storeSession,
  updateMainSessionSubprocess,
  updateSessionContext,
  updateSessionHistory,
  updateSessionTodo,
} from "../utils/redis/store";
import { v4 as uuidv4 } from "uuid";
import { CopilotPrompts } from "../utils/copilot/prompts";
import { invoke_llm_with_retry } from "./llm.service";
import { genericInitTodo } from "../utils/copilot/todo";
import { toolRegistry } from "../tools/registry";
import SessionsModel, {
  loopHistoryDoc,
} from "../models/Sessions/Sessions.model";
import UserModel, { UserDoc } from "../models/User/User.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { runCommandOnKali, runRAGforMetasploit } from "./copilot.services";
import { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData } from "../types/copilot.types";

export type { HistoryData, ContextData, SingleCommandData, CommandData, CopilotSessionData };
export { invoke_llm_with_retry };

export const getNextStepType = (currentStep: string) => {
  let nextStep;

  switch (currentStep) {
    case "init":
      nextStep = "command";
      break;
    case "command":
      nextStep = "output";
      break;
    case "output":
      nextStep = "summary";
      break;
    case "summary":
      nextStep = "todo";
      break;
    case "todo":
      nextStep = "command";
      break;
    default:
      nextStep = "init";
  }

  return nextStep;
};

export const changeLastHistoryStepStatus = async ({
  sessionId,
  lastStepType,
  status,
}: {
  sessionId: string;
  lastStepType: string;
  status: "not-started" | "processing" | "pending" | "completed";
}) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  let loopHistory = [...session.loopHistory];

  if (loopHistory[loopHistory.length - 1].stepType === lastStepType) {
    loopHistory[loopHistory.length - 1].status = status;
  } else {
    throw new Error("Invalid last step type");
  }

  session.loopHistory = loopHistory;

  await session.save();
};

export const addNextloopHistoryStep = async ({
  sessionId,
  type,
  data,
}: any) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (!["command", "output", "summary", "todo"].includes(type)) {
    throw new Error("Invalid Step type");
  }

  let loopHistory = [...session.loopHistory];

  const lastStep = loopHistory[loopHistory.length - 1];

  if (lastStep.stepType === type) {
    throw new Error("Step already exists");
  }

  loopHistory.push({
    stepType: type,
    data,
    loop: session.loopStepsPerformed,
    status: "not-started",
  });

  session.loopHistory = loopHistory;

  await session.save();
};

const updateLastloopHistoryStep = async ({
  sessionId,
  lastStepType,
  newData,
}: {
  sessionId: string;
  lastStepType: string;
  newData: any;
}) => {
  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (!["command", "output", "summary", "todo"].includes(lastStepType)) {
    throw new Error("Invalid Step type");
  }

  let loopHistory = [...session.loopHistory];

  if (loopHistory[loopHistory.length - 1].stepType !== lastStepType) {
    throw new Error("Invalid last step type");
  }

  loopHistory[loopHistory.length - 1].data = {
    ...loopHistory[loopHistory.length - 1].data,
    ...newData,
  };

  session.loopHistory = loopHistory;

  await session.save();
};

export const createNewSession = async ({
  uid,
  isMainThread = true,
}: {
  uid: string;
  isMainThread?: boolean;
}) => {
  const sessionId = uuidv4().toString();

  await storeSession({
    uid,
    sessionId,
    todo: genericInitTodo,
    isMainThread: isMainThread ? 1 : 0,
  });

  return sessionId;
};

/**
 *
 * Main Copilot Driver
 */

export const initCopilotSession = async ({
  sessionId,
  target_info,
  recon_info,
  recon,
}: {
  sessionId: string;
  target_info: string;
  recon_info: string;
  recon: boolean;
}) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("UserId not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId, uid: user._id });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    sessionData.history = [];
    const sessionHistory = sessionData.history;

    if (sessionData.isMainThread) {
      const capConfig = {
        tools: user.configs.tools,
        capabilities: user.configs.capabilities ?? [],
        installedCapabilities: user.configs.installedCapabilities ?? [],
      };
      const sysInit = await CopilotPrompts.generate_system_init(
        sessionId,
        user.configs.tools,
        true,
        capConfig
      );

      sessionHistory.push({
        role: "system",
        content: sysInit,
        loopStep: 0,
      });

      const commandTask = await CopilotPrompts.first_message(
        !!sessionData.isMainThread,
        recon_info,
        recon
      );

      sessionHistory.push({
        role: "user",
        content: commandTask.concat(target_info),
        loopStep: 0,
      });

      let initContent = `Pentest Initiated with the following target information: ${target_info}`;

      if (recon) {
        initContent += `\nRecon Information provided: ${target_info}`;
      }

      const initHistory: loopHistoryDoc[] = [
        {
          stepType: "init",
          data: {
            content: `Pentest Initiated with the following target information: ${target_info}`,
            choice: recon ? "yes" : "no",
            additionalContext: recon_info,
          },
          status: "completed",
          loop: dbSession.loopStepsPerformed,
        },
        {
          stepType: "command",
          data: {},
          status: "not-started",
          loop: dbSession.loopStepsPerformed,
        },
      ];

      dbSession.loopHistory = initHistory;

      await dbSession.save();
    } else {
      const capConfigSub = {
        tools: user.configs.tools,
        capabilities: user.configs.capabilities ?? [],
        installedCapabilities: user.configs.installedCapabilities ?? [],
      };
      const sysInit = await CopilotPrompts.generate_system_init(
        sessionId,
        user.configs.tools,
        false,
        capConfigSub
      );

      sessionHistory.push({
        role: "system",
        content: sysInit,
        loopStep: 1,
      });

      const context = sessionData.context;
      const contextSummary = context?.summary;
      const nextSteps = context?.nextSteps;

      if (contextSummary || nextSteps) {
        const contextMessage = `Here's the summary of the pentest performed: ${
          contextSummary ?? "We have just started the pentest"
        }.\nHere's the next steps: ${
          nextSteps ?? "None at the moment, think of something!"
        }`;

        sessionHistory.push({
          role: "user",
          content: contextMessage,
          loopStep: 1,
          isContextual: true,
        });

        const initHistory: loopHistoryDoc[] = [
          {
            loop: dbSession.loopStepsPerformed,
            stepType: "init",
            data: {
              content: `Subprocess Initiated with the following target information: ${contextSummary}`,
            },
            status: "pending",
          },
        ];

        dbSession.loopHistory = initHistory;

        await dbSession.save();
      }
    }

    await updateSessionHistory({
      sessionId,
      history: sessionHistory,
    });

    return {
      sessionId,
      message: "Pentest initiated",
      success: true,
    };
  } catch (e: any) {
    throw new Error(e);
  }
};

export const generateCommand = async ({ sessionId }: { sessionId: string }) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }


    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found in DB");
    }

    const sessionHistory = sessionData.history;

    if (dbSession.redoContext) {
      const redoData = `\nThis is the context you need to keep in mind while generating commands: ${dbSession.redoContext}`;

      sessionHistory[sessionHistory.length - 1].content += redoData;
      dbSession.redoContext = null;
    }

    const { content: gptRes, success, meta } = await invoke_llm_with_retry(
      sessionHistory,
      sessionId
    );

    if (!success) {
      console.log("Error generating GPT4 command");
      console.dir(gptRes, { depth: null });
      throw new Error("Error generating GPT4 command");
    }

    let fixedRes = JSON.parse(gptRes ?? "{}");

    let commands = fixedRes.commands;

    let containsMsfvenomOrMsfconsole = false;

    commands = commands.map((command: any) => {
      if (command.tool_name === "msfvenom_payload") {
        containsMsfvenomOrMsfconsole = true;
      }

      if (
        command?.tool_name === "run_bash" &&
        command?.args?.command?.includes("msfconsole")
      ) {
        containsMsfvenomOrMsfconsole = true;
      }

      // for (let key in command.args) {
      //   if (typeof command.args[key] === "string") {
      //     updatedArgs[key] = escapeQuotes(command.args[key]);
      //   } else {
      //     updatedArgs[key] = command.args[key]; // Preserve non-string values
      //   }
      // }

      return command;
    });

    if (commands.length === 0) {
      throw new Error("No commands found");
    }

    fixedRes.commands = commands;

    const summary = sessionData.context?.summary ?? "";

    if (containsMsfvenomOrMsfconsole) {
      fixedRes = await runRAGforMetasploit(fixedRes, commands, summary, sessionId);
    }

    for (const command of fixedRes.commands) {
      command.active = true;
      command.loop = dbSession.loopStepsPerformed;
      dbSession.storeCommands.push(command);
    }

    const taskCommandsResponse = JSON.stringify(fixedRes);

    sessionHistory.push({
      role: "assistant",
      content: taskCommandsResponse,
      loopStep: 1,
      isContextual: true,
    });



    // Updations to Database

    // Updates the command data
    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "command",
      newData: {
        content: taskCommandsResponse,
        llm: meta,
      },
    });

    // Updates the command status to pending
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "command",
      status: "pending",
    });

    await updateSessionHistory({
      sessionId,
      history: sessionHistory,
    });

    await dbSession.save();

    // await recordCommandGenUsage({
    //   userId,
    //   credits: 1,
    //   description: `Command Generated for Workspace - ${sessionId}`,
    // });

    return {
      success: true,
      message: "Commands Generated",
      session_id: sessionId,
      copilotResponse: taskCommandsResponse,
    };
  } catch (e: any) {
    console.log(e);
    return {
      status: "error",
      message: e.message ?? "Error Generating Command",
      session_id: sessionId,
      copilot_response: null,
    };
  }
};

export const finalizeCommandToRun = async ({ sessionId, command }: any) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found in DB");
    }

    const sessionHistory = sessionData.history;
    const commandId = command.commandId;
    const tool_name = command.tool_name;
    const command_args = command.command_args;
    const choice = command.choice;

    let toolResponse: string = "";

    if (toolRegistry.has(tool_name)) {
      toolResponse = await toolRegistry.execute(tool_name, {
        commandId,
        args: command_args,
        choice,
      });
    }

    const newData: any = {
      choice,
      tool: tool_name,
    };

    if (choice === "edit") {
      newData.additionalContext = JSON.stringify(command_args.command ?? command_args.script ?? command_args);
    } else if (["provide_output", "no", "provide_guidance"].includes(choice)) {
      newData.additionalContext = command_args.output;
    }

    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "command",
      newData: newData,
    });

    if (
      toolResponse &&
      (["provide_output", "no", "provide_guidance"].includes(choice) ||
        tool_name === "generic_response" ||
        tool_name === "google" ||
        tool_name === "netcat_listener")
    ) {
      const commandToEdit: SingleCommandData | undefined =
        dbSession.storeCommands.find(
          (item) => item._id?.toString() === commandId
        );

      if (!!commandToEdit) {
        commandToEdit.tool_name = tool_name;
        commandToEdit.args = command_args;
        commandToEdit.active = false;
      }

      await dbSession.save();

      await SessionsModel.findOneAndUpdate(
        {
          uid: user._id,
          sessionId,
          "storedCommands._id": commandId,
        },
        {
          $set: {
            "storedCommands.$.active": false,
          },
        }
      );

      sessionHistory.push({
        role: "user",
        content: toolResponse,
        loopStep: 2,
        isContextual: true,
      });

      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "command",
        status: "completed",
      });

      await addNextloopHistoryStep({
        sessionId,
        type: "output",
        data: {
          content: toolResponse,
          tool: tool_name,
        },
      });

      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "output",
        status: "pending",
      });

      await clearCommandFromSubprocess(sessionId);

      await updateSessionHistory({
        sessionId,
        history: sessionHistory,
      });

      return {
        success: true,
        message: "Command Executed",
        session_id: sessionId,
        tool_response: toolResponse,
        type: "output",
      };
    } else {
      await changeLastHistoryStepStatus({
        sessionId,
        lastStepType: "command",
        status: "completed",
      });

      await addNextloopHistoryStep({
        sessionId,
        type: "output",
        data: {
          tool: tool_name,
        },
      });

      return {
        success: true,
        message: "Command Generated",
        session_id: sessionId,
        command: toolResponse,
        commandId: command.commandId,
        type: "command",
      };
    }
  } catch (error) {
    console.log(error);
    return {
      success: false,
      message: "Error Executing Command",
      session_id: sessionId,
      tool_response: null,
    };
  }
};

export const storeExecutedCommandOutput = async (
  commandId: string,
  session_id: string,
  output: string,
  tool_name: string
) => {
  console.log("storing command", commandId);
  const session = await SessionsModel.findOne({
    sessionId: session_id,
  });

  if (!session) {
    return;
  }

  const sessionData = await getSessionData(session_id);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const userId = sessionData.uid;

  if (!userId) {
    throw new Error("User not found");
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const dbSession = await SessionsModel.findOne({
    sessionId: session_id,
    uid: user._id,
  });

  if (!dbSession) {
    throw new Error("Session not found in DB");
  }

  const sessionHistory = sessionData.history;


  await updateLastloopHistoryStep({
    sessionId: session_id,
    lastStepType: "output",
    newData: {
      content: output,
      tool: tool_name,
    },
  });

  await changeLastHistoryStepStatus({
    sessionId: session_id,
    lastStepType: "output",
    status: "pending",
  });

  console.log("updated loop history");

  // dbSession.storeCommands = dbSession.storeCommands.map((item) => {
  //   if (item._id?.toString() === commandId) {
  //     item.active = false;
  //   }
  //   return item;
  // });

  // await dbSession.save();

  const updatedStoredCommands = dbSession.storeCommands.map((item) => {
    if (item._id?.toString() === commandId) {
      item.active = false;
    }
    return item;
  });

  // convert to updateOne
  await SessionsModel.findOneAndUpdate(
    {
      sessionId: session_id,
      uid: user._id,
    },
    {
      $set: {
        storeCommands: updatedStoredCommands,
      },
    }
  );

  console.log("updated stored commands");

  // @TODO: Better logic for truncated output.
  // Remove unnecessary newlines and extra spaces
  const cleanedOutput = output.replace(/\s+/g, " ").trim();

  // Truncate to 6000 characters
  const truncatedOutput =
    cleanedOutput.length > 6000
      ? cleanedOutput.substring(0, 6000)
      : cleanedOutput;

  sessionHistory.push({
    role: "user",
    content: truncatedOutput,
    loopStep: 2,
    isContextual: true,
  });

  await updateSessionHistory({
    sessionId: session_id,
    history: sessionHistory,
  });
  await clearCommandFromSubprocess(session_id);
};

export const finalizeOutputAndGetSummary = async (sessionId: string) => {
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  const userId = sessionData.uid;

  if (!userId) {
    throw new Error("User not found");
  }

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const sessionHistory = sessionData.history;
  const contextualHistory: HistoryData[] = [];

  for (const item of sessionHistory) {
    if (item.isContextual === true) {
      contextualHistory.push(item);
    }
  }
  let isFirstSummary = false;
  let previousContext = null;
  if (sessionData.previousContexts?.length === 0) {
    isFirstSummary = true;
  } else {
    previousContext =
      sessionData.previousContexts?.[sessionData.previousContexts.length - 1]
        ?.summary;
  }

  if (!isFirstSummary && previousContext) {
    contextualHistory.unshift({
      role: "system",
      content: CopilotPrompts.use_prev_contextual_history_system_prompt(
        previousContext ?? "No previous context"
      ),
      isContextual: false,
    });
  } else {
    contextualHistory.unshift({
      role: "system",
      content: CopilotPrompts.contextual_history_system_prompt(),
      isContextual: false,
    });
  }

  contextualHistory.push({
    role: "user",
    content: CopilotPrompts.summarize_loop(),
    isContextual: false,
  });

  if (session.redoContext) {
    const redoData = `\nThis is the context you need to keep in mind while generating summary and next steps: ${session.redoContext}`;

    contextualHistory[contextualHistory.length - 1].content += redoData;
    session.redoContext = null;
  }

  let { content: context, success, meta } = await invoke_llm_with_retry(
    contextualHistory,
    sessionId
  ) as { content: any; success: boolean; meta?: any };

  if (!success) {
    throw new Error("Error generating GPT4 summary");
  }

  context = JSON.parse(context);

  sessionData.history.push({
    role: "assistant",
    content: context,
    loopStep: 3,
  });

  const previousContexts = sessionData.previousContexts ?? [];

  previousContexts.push({
    summary: context.summary,
    nextSteps: context.nextSteps,
  });

  await updateLastloopHistoryStep({
    sessionId,
    lastStepType: "summary",
    newData: {
      content: JSON.stringify({
        loopSummary: context.summary,
        nextSteps: context.nextSteps,
      }),
      llm: meta,
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    lastStepType: "summary",
    status: "pending",
  });

  await updateSessionHistory({
    sessionId,
    history: sessionHistory,
  });

  await updateSessionContext({
    sessionId,
    context,
    previousContexts,
  });

  await session.save();

  return {
    success: true,
    message: "Summary Generated",
    session_id: sessionId,
    data: context,
  };
};

export const finalizeSummaryContext = async ({
  sessionId,
  additionalContext,
}: {
  sessionId: string;
  additionalContext: string;
}) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    if (additionalContext) {
      await updateLastloopHistoryStep({
        sessionId,
        lastStepType: "summary",
        newData: {
          additionalContext: additionalContext,
        },
      });
    }

    await addNextloopHistoryStep({
      sessionId,
      type: "todo",
      data: {},
    });

    return {
      success: true,
      message: "Finalized Summary",
      session_id: sessionId,
    };
  } catch (error) {
    console.log(error);

    return {
      success: false,
      message: "Error Finalizing Summary",
    };
  }
};

export const finalizeTodoAndGetNewCommand = async (sessionId: string) => {
  try {
    const sessionData = await getSessionData(sessionId);

    if (!sessionData) {
      throw new Error("Session not found");
    }

    const dbSession = await SessionsModel.findOne({ sessionId });

    if (!dbSession) {
      throw new Error("Session not found");
    }

    const userId = sessionData.uid;

    if (!userId) {
      throw new Error("User not found");
    }

    const user = await UserModel.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Generate Todo List
    const newHistory: HistoryData[] = [];

    const contextSummary = sessionData.context?.summary;
    const contextNextSteps = sessionData.context?.nextSteps;
    const additionalContext =
      dbSession.loopHistory[dbSession.loopHistory.length - 1].data
        .additionalContext;

    const summaryPrompt = CopilotPrompts.summary_context_message(
      contextSummary,
      contextNextSteps,
      additionalContext,
      !!sessionData.isMainThread
    );
    const todoSummaryPrompt = await CopilotPrompts.todo_update_init(sessionId);
    // Update Todo List
    const todoHistory: HistoryData[] = [];

    todoHistory.push({
      role: "system",
      content: todoSummaryPrompt,
      isContextual: false,
      loopStep: 0,
    });

    todoHistory.push({
      role: "user",
      content: summaryPrompt,
      isContextual: true,
      loopStep: 0,
    });

    // await storeInputTokensGPT4(sessionId, todoHistory);

    if (dbSession.redoContext) {
      const redoData = `\nThis is the context you need to keep in mind while generating todo: ${dbSession.redoContext}`;

      todoHistory[todoHistory.length - 1].content += redoData;
      dbSession.redoContext = null;
    }

    const { success, content: todoResponse, meta } = await invoke_llm_with_retry(
      todoHistory,
      sessionId
    );

    if (!success) {
      throw new Error("Error generating GPT4 todo");
    }

    console.log("todoResponse\n", todoResponse);

    const todoResponseFixed = JSON.parse(todoResponse ?? "{}");


    await updateSessionTodo({
      sessionId,
      todo: todoResponseFixed.todo,
    });

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "todo",
      status: "pending",
    });

    await updateLastloopHistoryStep({
      sessionId,
      lastStepType: "todo",
      newData: {
        content: JSON.stringify(todoResponseFixed.todo),
        llm: meta,
      },
    });

    const archiveHistory = await HistoryArchiveModel.findOne({
      sessionId,
    });

    if (archiveHistory) {
      let loopNum = archiveHistory.history.length;

      if (loopNum) {
        loopNum =
          archiveHistory.history[archiveHistory.history.length - 1].loop + 1;
      }

      const saveHistory = sessionData.history.map((item) => {
        return {
          ...item,
          content: JSON.stringify(item.content),
          loop: loopNum + 1,
        };
      });

      archiveHistory.history = [...archiveHistory.history, ...saveHistory];

      await archiveHistory.save();
    }

    const capConfigFinal = {
      tools: user.configs.tools,
      capabilities: user.configs.capabilities ?? [],
      installedCapabilities: user.configs.installedCapabilities ?? [],
    };
    const sysInit = await CopilotPrompts.generate_system_init(
      sessionId,
      user.configs.tools,
      false,
      capConfigFinal
    );
    // const nextStepsAndMaintainJson = await CopilotPrompts.contextual_next_steps(
    //   summaryPrompt
    // );

    newHistory.push({
      role: "system",
      content: sysInit,
      isContextual: false,
      loopStep: 0,
    });

    // newHistory.push({
    //   role: "user",
    //   content: summaryPrompt,
    //   isContextual: true,
    //   loopStep: 0,
    // });

    // newHistory.push({
    //   role: "assistant",
    //   content: nextStepsAndMaintainJson,
    //   isContextual: false,
    //   loopStep: 0,
    // });

    newHistory.push({
      role: "user",
      content: CopilotPrompts.tool_inventory_maintain_json(
        !!sessionData.isMainThread,
        user.configs.tools,
        summaryPrompt,
        capConfigFinal
      ),
      isContextual: false,
      loopStep: 0,
    });

    await updateSessionHistory({
      sessionId,
      history: newHistory,
    });

    const updatedStoredCommands = dbSession.storeCommands.map((item) => {
      item.active = false;
      return item;
    });

    await SessionsModel.findOneAndUpdate(
      {
        sessionId,
        uid: user._id,
      },
      {
        $set: {
          storeCommands: updatedStoredCommands,
        },
      }
    );

    console.log("updated stored commands");

    return {
      success: true,
      message: "Finalized Todo and Reset History",
      session_id: sessionId,
    };
  } catch (error) {
    console.log(error);
  }
};

export const createNewSubProcess = async (sessionId: string) => {
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const sessionHistory = sessionData.history;
  const sessionContext = sessionData.context;
  let sessionSubprocesses = sessionData.subprocess;

  const lastHistory = sessionHistory[sessionHistory.length - 1];
  const lastHistoryJSON = JSON.parse(lastHistory.content);

  const commands = lastHistoryJSON.commands;

  for (const command of commands) {
    const subprocessId = uuidv4().toString();

    const subprocess = {
      id: subprocessId,
      main_session_id: sessionId,
      command: command,
      context: sessionContext,
      status: "running",
    };

    console.log({ subprocess });

    if (!sessionSubprocesses) {
      console.log("creating new subprocess array");
      sessionSubprocesses = [];
    }

    console.log("pushing subprocess");
    sessionSubprocesses.push(subprocess);

    console.log({
      uid: sessionData.uid,
      sessionId: subprocessId,
      context: sessionContext,
      command: command,
      history: [],
      isMainThread: 0,
      mainSessionId: sessionId,
    });

    console.log("storing subprocess");
    // Store Subprocess
    await storeSession({
      uid: sessionData.uid,
      sessionId: subprocessId,
      context: sessionContext,
      command: command,
      history: [],
      isMainThread: 0,
      mainSessionId: sessionId,
    });

    console.log("update main session subprocess");
    // Update Main Session with subprocesses
    await updateMainSessionSubprocess({
      sessionId,
      subprocess: sessionSubprocesses,
    });
  }

  return sessionSubprocesses;
};

export const completeSessionSubprocess = async (subprocessId: string) => {
  const subprocessData = await getSessionData(subprocessId);

  if (!subprocessData) {
    throw new Error("Subprocess not found");
  }

  const context = subprocessData.context;

  if (!context) {
    throw new Error("Subprocess Context not found");
  }

  await completeSubprocess({
    subprocessId: subprocessId,
    context,
  });

  return subprocessData;
};

export const analyzeSubprocessData = async (
  sessionId: string,
  user: UserDoc
) => {
  console.log("analyseSubprocessData", sessionId);
  const sessionData = await getSessionData(sessionId);

  if (!sessionData) {
    throw new Error("Subprocess not found");
  }

  await changeLastHistoryStepStatus({
    sessionId,
    status: "completed",
    lastStepType: "command",
  });

  await addNextloopHistoryStep({
    sessionId,
    type: "output",
    data: {},
  });

  const contexts: string[] = [];

  console.log(
    "local subprocess",
    JSON.stringify(sessionData.subprocess, null, 4)
  );

  for (const subprocess of sessionData.subprocess) {
    const subprocess_context: string | null = subprocess["context"]["summary"];

    if (subprocess_context === null) {
      continue;
    }

    contexts.push(subprocess_context);
  }

  const capConfigAnalyze = {
    tools: user.configs.tools,
    capabilities: user.configs.capabilities ?? [],
    installedCapabilities: user.configs.installedCapabilities ?? [],
  };
  const sysInit = await CopilotPrompts.generate_system_init(
    sessionId,
    user.configs.tools,
    false,
    capConfigAnalyze
  );
  const prompt_for_analysis: string =
    CopilotPrompts.prompt_for_analysis(contexts);
  const new_history: any[] = [];

  new_history.push({
    role: "system",
    content: sysInit,
    isContextual: false,
    loopStep: 0,
  });

  // Contextual Summary Prompt
  new_history.push({
    role: "user",
    content: prompt_for_analysis,
    isContextual: true,
    loopStep: 0,
  });

  // await storeInputTokensGPT4(sessionId, new_history);

  const {
    content: global_summary,
    success,
    meta,
  } = await invoke_llm_with_retry(new_history, sessionId);

  if (!success) {
    throw new Error("Error generating GPT4 summary");
  }

  const assistant_prompt: string = `I have analyzed the subprocesses and here is the summary: ${global_summary}`;

  sessionData.history.push({
    role: "assistant",
    content: assistant_prompt,
    isContextual: true,
    loopStep: 2,
  });

  await updateSessionHistory({
    sessionId,
    history: sessionData.history,
  });

  await updateLastloopHistoryStep({
    sessionId,
    lastStepType: "output",
    newData: {
      content: assistant_prompt,
      llm: meta,
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    status: "pending",
    lastStepType: "output",
  });

  await clearSessionSubprocesses(sessionId);

  return {
    success: true,
    message: "Context Analyzed and Passed to Main Thread",
    session_id: sessionId,
    data: global_summary,
  };
};

export const initNetcatSession = async (sessionId: string) => {
  // await completeLastHistoryStep({ sessionId, lastStepType: "command" });

  const session = await SessionsModel.findOne({ sessionId });

  if (!session) {
    throw new Error("Session not found");
  }

  if (session.loopHistory.length === 0) {
    return {
      success: true,
    };
  }

  await changeLastHistoryStepStatus({
    sessionId,
    status: "completed",
    lastStepType: "command",
  });

  await addNextloopHistoryStep({
    sessionId,
    type: "output",
    data: {
      content: "Netcat session started",
    },
  });

  await changeLastHistoryStepStatus({
    sessionId,
    status: "pending",
    lastStepType: "output",
  });

  return {
    success: true,
  };
};

export const extractRelevantContextUsingGPT3 = async (
  title: string,
  url: string,
  content: string
) => {
  try {
    const systemPrompt = CopilotPrompts.web_analysis_system_prompt();
    const history: HistoryData[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Please return your thoughts on this in a good format starting with the Webpage Title: ${title}, Target URL: ${url}\nHere is the webpage content: ${content}`,
      },
    ];

    const { content: gptRes, success } = await invoke_llm_with_retry(history, "");

    console.log(gptRes);
    if (!success) {
      throw new Error("Error generating GPT3 response");
    }

    return gptRes;
  } catch (error) {
    console.log(error);
    throw new Error("Error contextualizing context");
  }
};

/**
 * Agentic Continue — chains output → summary → todo → next command
 * in a single call. The loop pauses only when a new command is generated
 * and awaits human approval.
 */
export const agenticContinue = async ({
  sessionId,
  additionalContext,
}: {
  sessionId: string;
  additionalContext?: string;
}) => {
  console.log("[agenticContinue] Starting agentic loop for", sessionId);

  const dbSession = await SessionsModel.findOne({ sessionId });
  if (!dbSession) throw new Error("Session not found");

  const lastStep = dbSession.loopHistory[dbSession.loopHistory.length - 1];
  const currentStepType = lastStep?.stepType;
  const currentStatus = lastStep?.status;

  console.log("[agenticContinue] Current step:", currentStepType, "status:", currentStatus);

  // Phase 0: If at init/pending (after undo), re-create command step and generate
  if (currentStepType === "init" && (currentStatus === "pending" || currentStatus === "completed")) {
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "init",
      status: "completed",
    });

    await addNextloopHistoryStep({ sessionId, type: "command", data: {} });

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "command",
      status: "processing",
    });

    const commandResult = await generateCommand({ sessionId });
    console.log("[agenticContinue] Command generated from init step");

    return {
      success: true,
      phase: "command_ready",
      message: "Agentic loop completed — command ready for approval",
      copilotResponse: commandResult?.copilotResponse ?? null,
    };
  }

  // Phase 0b: If at command/pending (after undo), generate command directly
  if (currentStepType === "command" && (currentStatus === "pending" || currentStatus === "not-started")) {
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "command",
      status: "processing",
    });

    const commandResult = await generateCommand({ sessionId });
    console.log("[agenticContinue] Command generated from pending command step");

    return {
      success: true,
      phase: "command_ready",
      message: "Agentic loop completed — command ready for approval",
      copilotResponse: commandResult?.copilotResponse ?? null,
    };
  }

  // Phase 1: If we're at output/pending, generate summary
  if (currentStepType === "output" && currentStatus === "pending") {
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "output",
      status: "completed",
    });

    await addNextloopHistoryStep({ sessionId, type: "summary", data: {} });

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "summary",
      status: "processing",
    });

    const summaryResult = await finalizeOutputAndGetSummary(sessionId);
    if (!summaryResult?.success) {
      throw new Error("Failed to generate summary in agentic loop");
    }
    console.log("[agenticContinue] Summary generated");
  }

  // Re-fetch session state
  const dbSession2 = await SessionsModel.findOne({ sessionId });
  if (!dbSession2) throw new Error("Session not found");
  const step2 = dbSession2.loopHistory[dbSession2.loopHistory.length - 1];

  // Phase 2: If at summary/pending, finalize it and generate todo
  if (step2?.stepType === "summary" && step2?.status === "pending") {
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "summary",
      status: "completed",
    });

    if (additionalContext) {
      await finalizeSummaryContext({ sessionId, additionalContext });
    } else {
      await addNextloopHistoryStep({ sessionId, type: "todo", data: {} });
    }

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "todo",
      status: "processing",
    });

    await finalizeTodoAndGetNewCommand(sessionId);
    console.log("[agenticContinue] Todo generated, history reset");
  }

  // Re-fetch session state
  const dbSession3 = await SessionsModel.findOne({ sessionId });
  if (!dbSession3) throw new Error("Session not found");
  const step3 = dbSession3.loopHistory[dbSession3.loopHistory.length - 1];

  // Phase 3: If at todo/pending, finalize it and generate next command
  if (step3?.stepType === "todo" && step3?.status === "pending") {
    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "todo",
      status: "completed",
    });

    await SessionsModel.findOneAndUpdate(
      { sessionId },
      {
        $set: { "loops.$[elem].endTimestamp": new Date() },
        $inc: { loopStepsPerformed: 1 },
      },
      { arrayFilters: [{ "elem.loop": dbSession3.loopStepsPerformed }] }
    );

    await addNextloopHistoryStep({ sessionId, type: "command", data: {} });

    const updatedSession = await SessionsModel.findOne({ sessionId });
    await SessionsModel.findOneAndUpdate(
      { sessionId },
      {
        $push: {
          loops: {
            startTimestamp: new Date(),
            loop: (updatedSession?.loopStepsPerformed ?? 0),
          },
        },
      }
    );

    await changeLastHistoryStepStatus({
      sessionId,
      lastStepType: "command",
      status: "processing",
    });

    const commandResult = await generateCommand({ sessionId });
    console.log("[agenticContinue] Next command generated");

    return {
      success: true,
      phase: "command_ready",
      message: "Agentic loop completed — command ready for approval",
      copilotResponse: commandResult?.copilotResponse ?? null,
    };
  }

  return {
    success: true,
    phase: step3?.stepType ?? "unknown",
    message: "Agentic continue processed",
  };
};

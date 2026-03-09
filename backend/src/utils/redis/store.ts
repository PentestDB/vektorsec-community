import { redisClient } from "../../server";
import {
  ContextData,
  HistoryData,
  SingleCommandData,
  CopilotSessionData,
} from "../../services/copilot.services";

// get session data
export const getSessionData = async (sessionId: string) => {
  try {
    const sessionKey = `session:${sessionId}`;

    let sessionData: any = await redisClient.HGETALL(sessionKey);

    sessionData = Object.fromEntries(
      Object.entries(sessionData).map(([key, value]: any) => [
        key.toString(),
        value.toString(),
      ])
    );

    const historyKey = `${sessionKey}:history`;

    const history = await redisClient.LRANGE(historyKey, 0, -1);

    const finalHistory = history.map((item) => JSON.parse(item.toString()));

    sessionData["history"] = finalHistory;

    const sessionNetcatKey = `${sessionKey}:netcat`;

    const netcatList = await redisClient.LRANGE(sessionNetcatKey, 0, -1);

    const finalNetcatList = netcatList.map((item) =>
      JSON.parse(item.toString())
    );

    sessionData["netcat"] = finalNetcatList;

    sessionData["isMainThread"] = Number(sessionData["isMainThread"]);

    const contextJSON = sessionData["context"];

    if (contextJSON) {
      sessionData["context"] = JSON.parse(contextJSON);
    }

    const commandJSON = sessionData["command"];

    if (commandJSON) {
      sessionData["command"] = JSON.parse(commandJSON);
    }

    const status = sessionData["status"];

    if (status) {
      sessionData["status"] = JSON.parse(status);
    }

    const subprocessKey = `${sessionKey}:subprocess`;
    const subprocessList = await redisClient.LRANGE(subprocessKey, 0, -1);

    if (subprocessList?.length > 0) {
      const finalSubprocessList = subprocessList.map((item) =>
        JSON.parse(item.toString())
      );
      sessionData["subprocess"] = finalSubprocessList;
    }

    const previousContextsKey = `${sessionKey}:previous_contexts`;

    const previousContexts = await redisClient.LRANGE(
      previousContextsKey,
      0,
      -1
    );

    const finalPreviousContexts = previousContexts.map((item) =>
      JSON.parse(item.toString())
    );

    sessionData["previousContexts"] = finalPreviousContexts;

    const mainSessionId = sessionData["main_session_id"];

    if (mainSessionId) {
      sessionData["main_session_id"] = mainSessionId.toString();
    }

    const finalSessionData: CopilotSessionData = {
      uid: sessionData["uid"],
      sessionId: sessionData["sessionId"],
      history: sessionData["history"],
      context: sessionData["context"],
      command: sessionData["command"],
      isMainThread: sessionData["isMainThread"],
      subprocess: sessionData["subprocess"],
      netcat: sessionData["netcat"],
      previousContexts: sessionData["previousContexts"],
      mainSessionId: sessionData["main_session_id"],
    };

    return finalSessionData;
  } catch (err) {
    console.log("Error in getSessionData");
    console.log(err);
  }
};

// store session data
export const storeSession = async ({
  uid,
  sessionId,
  history,
  context,
  scans,
  command,
  mainSessionId,
  isMainThread = 1,
}: {
  uid: string;
  sessionId: string;
  history?: HistoryData[];
  context?: ContextData;
  command?: SingleCommandData;
  mainSessionId?: string;
  isMainThread?: number;
  scans?: any;
}) => {
  try {
    // await connectToRedis();
    const sessionKey = `session:${sessionId}`;

    if (uid) {
      await redisClient.HSET(sessionKey, "uid", uid);
    }

    if (history) {
      const historyKey = `${sessionKey}:history`;

      await redisClient.del(historyKey);

      for (const item of history) {
        await redisClient.RPUSH(historyKey, JSON.stringify(item, null, 2));
      }
    }

    if (context) {
      await redisClient.HSET(sessionKey, "context", JSON.stringify(context));
    }

    if (scans) {
      await redisClient.HSET(sessionKey, "scans", JSON.stringify(scans));
    }

    if (command) {
      await redisClient.HSET(sessionKey, "command", JSON.stringify(command));
    }

    if (mainSessionId) {
      await redisClient.HSET(sessionKey, "main_session_id", mainSessionId);
    }

    await redisClient.HSET(sessionKey, "isMainThread", isMainThread ?? 1);

    return;
  } catch (err) {
    console.log(err);
  }
};

// is Valid Session
export const isValidSession = async (sessionId: string) => {
  try {
    // await connectToRedis();
    const sessionKey = `session:${sessionId}`;

    const sessionExists = await redisClient.exists(sessionKey);
    const sessionHistoryExists = await redisClient.exists(
      `${sessionKey}:history`
    );
    const sessionContextExists = await redisClient.exists(
      `${sessionKey}:context`
    );
    if (
      sessionExists &&
      sessionHistoryExists &&
      sessionContextExists
    ) {
      return true;
    }
  } catch (err) {
    console.log(err);
  }
};

// create Subprocess
// export const createSubprocess = async ({
//   sessionId,
//   command,
//   context,
// }: any) => {
//   try {
//     // await connectToRedis();
//     const mainSessionKey = `session:${sessionId}`;

//     const subprocessId = uuidv4().toString();

//     const subprocess = {
//       id: subprocessId,
//       main_session_id: sessionId,
//       command: command,
//       context: context,
//       status: "running",
//     };

//     const mainProcess: any = await getSessionData(sessionId);

//     const allInstances = [];

//     if (mainProcess["subprocess"]) {
//       allInstances.push(...mainProcess["subprocess"]);
//     }

//     allInstances.push(subprocess);

//     await redisClient.del(`${mainSessionKey}:subprocess`);

//     for (const item of allInstances) {
//       await redisClient.RPUSH(
//         `${mainSessionKey}:subprocess`,
//         JSON.stringify(item, null, 2)
//       );
//     }

//     await storeSession({
//       sessionId: subprocessId,
//       context: context,
//       command: command,
//       history: [],
//       isMainThread: 0,
//       mainSessionId: sessionId,
//     });

//     // await redisClient.disconnect();

//     return subprocessId;
//   } catch (err) {
//     console.log(err);
//   }
// };

// complete Subprocess
export const completeSubprocess = async ({
  subprocessId,
  context,
}: {
  subprocessId: string;
  context: ContextData;
}) => {
  try {
    // await connectToRedis();
    const subprocessData = await getSessionData(subprocessId);

    const mainProcessId = subprocessData?.mainSessionId;

    if (!mainProcessId) {
      console.log("Main process id not found");
      return "Main process id not found";
    }

    const mainProcess: any = await getSessionData(mainProcessId);

    let subprocess: any;

    if (mainProcess?.subprocess) {
      for (const obj of mainProcess.subprocess) {
        if (obj.id === subprocessId) {
          subprocess = obj;
          break;
        }
      }
    }

    if (!subprocess) {
      console.log("Subprocess not found");
      return "Subprocess not found";
    }

    subprocess["status"] = "completed";

    if (context) {
      subprocess["context"] = context;
    }

    for (const [index, obj] of Object(mainProcess["subprocess"]).entries()) {
      if (obj.id === subprocessId) {
        mainProcess["subprocess"][index] = subprocess;
        break;
      }
    }

    const allIntances = mainProcess["subprocess"];

    await redisClient.del(`session:${mainProcessId}:subprocess`);

    for (const item of allIntances) {
      await redisClient.RPUSH(
        `session:${mainProcessId}:subprocess`,
        JSON.stringify(item, null, 2)
      );
    }

    // await redisClient.disconnect();

    return;
  } catch (err) {
    console.log(err);
  }
};

// update session summary
export const updateSessionSummary = async ({ sessionId, context }: any) => {
  // await connectToRedis();
  const session_key = `session:${sessionId}`;

  if (context) {
    const context_str = JSON.stringify(context);
    await redisClient.HSET(session_key, "context", context_str);
  }

  // await redisClient.disconnect();
};

export const updateSessionCommandToNone = async (sessionId: string) => {
  // await connectToRedis();
  await redisClient.HDEL(`session:${sessionId}`, "command");
};

export const storeNetcatSession = async ({ netcat_id, session_id }: any) => {
  const netcat_key = `netcat:${netcat_id}`;
  await redisClient.HSET(netcat_key, "main_session_id", session_id);
  await redisClient.HSET(netcat_key, "status", "pending");

  const sessionKey = `session:${session_id}`;

  // store netcat list in session
  const sessionNetcatKey = `${sessionKey}:netcat`;

  // get current netcat list
  const netcatList = await redisClient.LRANGE(sessionNetcatKey, 0, -1);

  let finalList = netcatList.map((item) => JSON.parse(item.toString()));

  finalList.push({
    netcat_id,
    status: "pending",
  });

  await redisClient.del(sessionNetcatKey);

  for (const item of finalList) {
    await redisClient.RPUSH(sessionNetcatKey, JSON.stringify(item, null, 2));
  }

  // await redisClient.disconnect();
};

export const updateNetcatSession = async ({
  netcat_id,
  port,
  session_id,
}: any) => {
  const netcat_key = `netcat:${netcat_id}`;
  await redisClient.HSET(netcat_key, "main_session_id", session_id);
  await redisClient.HSET(netcat_key, "port", port);
  await redisClient.HSET(netcat_key, "status", "started");

  const sessionKey = `session:${session_id}`;

  // store netcat list in session
  const sessionNetcatKey = `${sessionKey}:netcat`;

  // get current netcat list
  const netcatList = await redisClient.LRANGE(sessionNetcatKey, 0, -1);

  let finalList = netcatList.map((item) => JSON.parse(item.toString()));

  for (const [index, obj] of Object(finalList).entries()) {
    if (obj.netcat_id === netcat_id) {
      finalList[index]["status"] = "started";
      finalList[index]["port"] = port;
      break;
    }
  }

  // finalList.push({
  //   netcat_id,
  //   port,
  //   status: "started",
  // });

  await redisClient.del(sessionNetcatKey);

  for (const item of finalList) {
    await redisClient.RPUSH(sessionNetcatKey, JSON.stringify(item, null, 2));
  }

  // await redisClient.disconnect();
};

export const changeNetcatSessionStatus = async ({
  netcat_id,
  status,
  session_id,
}: any) => {
  // await connectToRedis();
  const netcat_key = `netcat:${netcat_id}`;

  const sessionKey = `session:${session_id}`;

  // store netcat list in session
  const sessionNetcatKey = `${sessionKey}:netcat`;

  // get current netcat list
  const netcatList = await redisClient.LRANGE(sessionNetcatKey, 0, -1);

  let finalList = netcatList.map((item) => JSON.parse(item.toString()));

  for (const [index, obj] of Object(finalList).entries()) {
    if (obj.netcat_id === netcat_id) {
      finalList[index]["status"] = status;
      break;
    }
  }

  await redisClient.HSET(netcat_key, "status", status);

  // await redisClient.disconnect();
};

export const getNetcatSession = async (netcat_id: string) => {
  // await connectToRedis();
  const netcatKey = `netcat:${netcat_id}`;

  const netcatSession: any = await redisClient.HGETALL(netcatKey);

  const inputKey = `${netcatKey}:input`;

  const input = await redisClient.LRANGE(inputKey, 0, -1);

  const finalInputs = input.map((item) => JSON.parse(item.toString()));

  netcatSession["input"] = finalInputs;

  // await redisClient.disconnect();
  return netcatSession;
};

export const getNetcatSessionOutput = async (netcat_id: string) => {
  // await connectToRedis();
  const netcatKey = `netcat:${netcat_id}`;

  const output = await redisClient.HGET(netcatKey, "output");

  return output;
};

export const storeNetcatOutput = async ({ netcatId, output }: any) => {
  // await connectToRedis();

  const netcatKey = `netcat:${netcatId}`;

  await redisClient.HSET(netcatKey, "output", output);
};

export const storeNetcatInput = async ({ netcatId, input }: any) => {
  // await connectToRedis();

  const netcatKey = `netcat:${netcatId}`;

  const inputKey = `${netcatKey}:input`;

  // get the input
  const currentInput = await redisClient.LRANGE(inputKey, 0, -1);

  const finalInput = currentInput.map((item) => JSON.parse(item.toString()));

  finalInput.push(input);

  await redisClient.del(inputKey);

  for (const item of finalInput) {
    await redisClient.RPUSH(inputKey, JSON.stringify(item, null, 2));
  }
};

export const updateMainSessionSubprocess = async ({
  sessionId,
  subprocess,
}: {
  sessionId: string;
  subprocess: any;
}) => {
  const mainSessionKey = `session:${sessionId}`;

  await redisClient.del(`${mainSessionKey}:subprocess`);

  for (const item of subprocess) {
    await redisClient.RPUSH(
      `${mainSessionKey}:subprocess`,
      JSON.stringify(item, null, 2)
    );
  }
};

export const updateSessionHistory = async ({
  sessionId,
  history,
}: {
  sessionId: string;
  history: HistoryData[];
}) => {
  const sessionKey = `session:${sessionId}`;

  await redisClient.del(`${sessionKey}:history`);

  for (const item of history) {
    await redisClient.RPUSH(
      `${sessionKey}:history`,
      JSON.stringify(item, null, 2)
    );
  }
};

export const updateSessionContext = async ({
  sessionId,
  context,
  previousContexts,
}: {
  sessionId: string;
  context: ContextData;
  previousContexts: ContextData[];
}) => {
  const sessionKey = `session:${sessionId}`;

  await redisClient.HSET(
    sessionKey,
    "context",
    JSON.stringify(context, null, 2)
  );

  await redisClient.del(`${sessionKey}:previous_contexts`);

  for (const item of previousContexts) {
    await redisClient.RPUSH(
      `${sessionKey}:previous_contexts`,
      JSON.stringify(item, null, 2)
    );
  }
};

export const clearSessionSubprocesses = async (sessionId: string) => {
  const sessionKey = `session:${sessionId}`;

  await redisClient.del(`${sessionKey}:subprocess`);

  // await redisClient.HSET(`${sessionKey}:subprocess`, []);
};

export const clearCommandFromSubprocess = async (sessionId: string) => {
  const sessionKey = `session:${sessionId}`;

  // remove command from the session key
  await redisClient.HDEL(sessionKey, "command");
};

export const deleteSubprocessOfMainThread = async (sessionId: string) => {
  try {
    const sessionKey = `session:${sessionId}`;

    const subprocessList = await redisClient.LRANGE(
      `${sessionKey}:subprocess`,
      0,
      -1
    );

    const finalSubprocessList = subprocessList.map((item) =>
      JSON.parse(item.toString())
    );

    const subprocessIds = finalSubprocessList.map((item) => item.id);

    for (const subprocessId of subprocessIds) {
      await redisClient.del(`session:${subprocessId}`);
      await redisClient.del(`session:${subprocessId}:history`);
    }

    await redisClient.del(`${sessionKey}:subprocess`);
  } catch (error) {
    console.log(error);
  }
};

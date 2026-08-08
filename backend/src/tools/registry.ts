import OpenAI from "openai";
import { ToolDefinition, toolToOpenAISchema, AgentRole } from "./types";

import runBash from "./handlers/run-bash";
import runPythonScript from "./handlers/run-python-script";
import runInstallTool from "./handlers/run-install-tool";
import googleSearch from "./handlers/google-search";
import askUser from "./handlers/generic-response";
import spawnShell from "./handlers/spawn-shell";
import writeToShell from "./handlers/write-to-shell";
import readShell from "./handlers/read-shell";
import listShells from "./handlers/list-shells";
import closeShell from "./handlers/close-shell";
import spawnSubagent from "./handlers/spawn-subagent";
import spawnSwarm from "./handlers/spawn-swarm";
import reportFinding from "./handlers/report-finding";
import checkFindings from "./handlers/check-findings";
import sendToBurp from "./handlers/send-to-burp";
import burpIntruder from "./handlers/burp-intruder";
import burpCollaborator from "./handlers/burp-collaborator";
import oobListener from "./handlers/oob-listener";
// import burpProxyControl from "./handlers/burp-proxy-control";
import burpProxyHistory from "./handlers/burp-proxy-history";
import sendToCaidoReplay from "./handlers/send-to-caido-replay";
import caidoHttpHistory from "./handlers/caido-http-history";
import caidoAutomate from "./handlers/caido-automate";
import caidoInterceptControl from "./handlers/caido-intercept-control";
import caidoOast from "./handlers/caido-oast";
import mythicCallbacks from "./handlers/mythic-callbacks";
import mythicTask from "./handlers/mythic-task";
import mythicTaskResults from "./handlers/mythic-task-results";
import mythicPivot from "./handlers/mythic-pivot";
import mythicPayload from "./handlers/mythic-payload";
import mythicListener from "./handlers/mythic-listener";
import mythicLoot from "./handlers/mythic-loot";
import mythicGraphqlTool from "./handlers/mythic-graphql";
import magnitudeBrowser from "./handlers/magnitude-browser";
import viewImage from "./handlers/view-image";
import updateEngagementState from "./handlers/update-engagement-state";
import getSolveStatus from "./handlers/get-solve-status";
import bumpRacer from "./handlers/bump-racer";
import broadcastToRacers from "./handlers/broadcast-to-racers";
import readRacerTrace from "./handlers/read-racer-trace";
import waitForRacers from "./handlers/wait-for-racers";
import runSecurityTool from "./handlers/run-security-tool";
import trackAttackChain from "./handlers/track-attack-chain";
import storeTargetMemory from "./handlers/store-target-memory";
import collectEvidence from "./handlers/collect-evidence";
import generateReport from "./handlers/generate-report";
import routeModel from "./handlers/route-model";
import checkScope from "./handlers/check-scope";
import requestApproval from "./handlers/request-approval";
import approveCommand from "./handlers/approve-command";
import runAsyncTask from "./handlers/run-async-task";
import getTaskStatus from "./handlers/get-task-status";
import queryKnowledge from "./handlers/query-knowledge";
import auditLog from "./handlers/audit-log";
import vaultManage from "./handlers/vault-manage";


class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  toOpenAISchemas(opts?: {
    excludeSubagent?: boolean;
    agentRole?: AgentRole;
    disabledTools?: string[];
    unconfiguredTools?: string[];
  }): OpenAI.Chat.ChatCompletionTool[] {
    let tools = this.getAll();
    if (opts?.agentRole) {
      tools = tools.filter((t) => {
        if (!t.allowedRoles) {
          return opts.agentRole !== "orchestrator";
        }
        return t.allowedRoles.includes(opts.agentRole!);
      });
    } else if (opts?.excludeSubagent) {
      tools = tools.filter((t) => t.name !== "spawn_subagent");
    }
    if (opts?.disabledTools?.length) {
      const disabled = new Set(opts.disabledTools);
      tools = tools.filter((t) => !disabled.has(t.name));
    }
    if (opts?.unconfiguredTools?.length) {
      const unconf = new Set(opts.unconfiguredTools);
      tools = tools.filter((t) => !unconf.has(t.name));
    }
    return tools.map(toolToOpenAISchema);
  }

  requiresConsent(name: string): boolean {
    return this.tools.get(name)?.requiresConsent ?? false;
  }

  getTimeout(name: string): number {
    return this.tools.get(name)?.timeoutMs ?? 300_000;
  }
}

export const toolRegistry = new ToolRegistry();

toolRegistry.register(runBash);
toolRegistry.register(runPythonScript);
toolRegistry.register(runInstallTool);
toolRegistry.register(googleSearch);
toolRegistry.register(askUser);
toolRegistry.register(spawnShell);
toolRegistry.register(writeToShell);
toolRegistry.register(readShell);
toolRegistry.register(listShells);
toolRegistry.register(closeShell);
toolRegistry.register(spawnSubagent);
toolRegistry.register(spawnSwarm);
toolRegistry.register(reportFinding);
toolRegistry.register(checkFindings);
toolRegistry.register(sendToBurp);
toolRegistry.register(burpIntruder);
toolRegistry.register(burpCollaborator);
toolRegistry.register(oobListener);
// toolRegistry.register(burpProxyControl);
toolRegistry.register(burpProxyHistory);
toolRegistry.register(sendToCaidoReplay);
toolRegistry.register(caidoHttpHistory);
toolRegistry.register(caidoAutomate);
toolRegistry.register(caidoInterceptControl);
toolRegistry.register(caidoOast);
toolRegistry.register(mythicCallbacks);
toolRegistry.register(mythicTask);
toolRegistry.register(mythicTaskResults);
toolRegistry.register(mythicPivot);
toolRegistry.register(mythicPayload);
toolRegistry.register(mythicListener);
toolRegistry.register(mythicLoot);
toolRegistry.register(mythicGraphqlTool);
toolRegistry.register(magnitudeBrowser);
toolRegistry.register(viewImage);
toolRegistry.register(updateEngagementState);
toolRegistry.register(getSolveStatus);
toolRegistry.register(bumpRacer);
toolRegistry.register(broadcastToRacers);
toolRegistry.register(readRacerTrace);
toolRegistry.register(waitForRacers);
toolRegistry.register(runSecurityTool);
toolRegistry.register(trackAttackChain);
toolRegistry.register(storeTargetMemory);
toolRegistry.register(collectEvidence);
toolRegistry.register(generateReport);
toolRegistry.register(routeModel);
toolRegistry.register(checkScope);
toolRegistry.register(requestApproval);
toolRegistry.register(approveCommand);
toolRegistry.register(runAsyncTask);
toolRegistry.register(getTaskStatus);
toolRegistry.register(queryKnowledge);
toolRegistry.register(auditLog);
toolRegistry.register(vaultManage);



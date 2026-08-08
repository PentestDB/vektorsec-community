import { ToolDefinition } from "../types";
import {
  AttackChain,
  AttackPhase,
  PHASE_LABELS,
  AttackChainState,
} from "../../services/attackChain";
import SessionsModel from "../../models/Sessions/Sessions.model";

// Attack chain is now persisted in the Session document so it survives server
// restarts and is injected into the system prompt on every turn.

async function loadChain(sessionId: string): Promise<AttackChain> {
  const session = await SessionsModel.findOne({ sessionId })
    .select("attackChain")
    .lean();
  if (session?.attackChain) {
    return AttackChain.fromState(
      sessionId,
      session.attackChain as unknown as AttackChainState,
    );
  }
  return new AttackChain(sessionId);
}

async function saveChain(sessionId: string, chain: AttackChain): Promise<void> {
  await SessionsModel.updateOne(
    { sessionId },
    { $set: { attackChain: chain.toState() } },
  );
}

const trackAttackChain: ToolDefinition = {
  name: "track_attack_chain",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Track the current phase of the attack chain (Recon → Enumeration → Exploitation → Post-Exploitation). " +
    "Use this to record what phase you're in, add steps, advance phases, and remember key findings " +
    "so you don't lose context. The chain is persisted and injected into your system prompt every turn. " +
    "Call this after each major action.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add_step", "advance_phase", "set_phase", "remember", "get_state"],
        description: "The action to perform on the attack chain",
      },
      phase: {
        type: "string",
        enum: ["recon", "enumeration", "exploitation", "post_exploitation", "reporting", "complete"],
        description: "The attack phase (for add_step, set_phase, remember)",
      },
      step_action: {
        type: "string",
        description: "Description of the step being taken (for add_step)",
      },
      target: {
        type: "string",
        description: "The target of this step",
      },
      tool: {
        type: "string",
        description: "The tool used for this step",
      },
      memory: {
        type: "string",
        description: "A key finding to remember for this phase (for remember)",
      },
    },
    required: ["action"],
  },
  timeoutMs: 20_000,
  async execute(args, ctx) {
    const { action, phase, step_action, target, tool, memory } = args;
    const sessionId = ctx.sessionId ?? "unknown";

    try {
      const chain = await loadChain(sessionId);

      switch (action) {
        case "add_step": {
          if (!step_action) {
            return { output: "Error: step_action is required for add_step", exitCode: 1 };
          }
          const step = chain.addStep({
            phase: (phase as AttackPhase) ?? chain.currentPhase,
            action: step_action,
            target,
            tool,
          });
          await saveChain(sessionId, chain);
          return {
            output: `Step added: [${PHASE_LABELS[step.phase]}] ${step_action}${target ? ` → ${target}` : ""}${tool ? ` (${tool})` : ""}`,
            exitCode: 0,
          };
        }

        case "advance_phase": {
          const next = chain.advancePhase();
          if (!next) {
            return { output: "Already at the final phase", exitCode: 0 };
          }
          await saveChain(sessionId, chain);
          return {
            output: `Advanced to phase: ${PHASE_LABELS[next]} (${next})`,
            exitCode: 0,
          };
        }

        case "set_phase": {
          if (!phase) {
            return { output: "Error: phase is required for set_phase", exitCode: 1 };
          }
          chain.setPhase(phase as AttackPhase);
          await saveChain(sessionId, chain);
          return {
            output: `Phase set to: ${PHASE_LABELS[phase as AttackPhase]} (${phase})`,
            exitCode: 0,
          };
        }

        case "remember": {
          if (!memory) {
            return { output: "Error: memory is required for remember", exitCode: 1 };
          }
          const targetPhase = (phase as AttackPhase) ?? chain.currentPhase;
          chain.remember(targetPhase, memory);
          await saveChain(sessionId, chain);
          return {
            output: `Remembered in ${PHASE_LABELS[targetPhase]}: ${memory}`,
            exitCode: 0,
          };
        }

        case "get_state": {
          return {
            output: chain.toPromptBlock(),
            exitCode: 0,
          };
        }

        default:
          return { output: `Error: unknown action '${action}'`, exitCode: 1 };
      }
    } catch (err: any) {
      return { output: `Error tracking attack chain: ${err.message}`, exitCode: 1 };
    }
  },
};

export default trackAttackChain;

import { v4 as uuidv4 } from "uuid";

// ─── Attack Chain Tracker (State Machine) ───────────────────────────
// แบ่ง Phase การโจมตีชัดเจน: Recon → Enum → Exploit → Post-Ex
// เพื่อให้ AI รู้ว่าอยู่ในขั้นตอนไหน และไม่ลืมข้อมูลการสแกนในขั้นตอนแรกๆ

export type AttackPhase =
  | "recon"
  | "enumeration"
  | "exploitation"
  | "post_exploitation"
  | "reporting"
  | "complete";

export interface AttackStep {
  stepId: string;
  phase: AttackPhase;
  action: string;
  target?: string;
  tool?: string;
  result?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  timestamp: Date;
  evidence?: string[];
}

export interface AttackChainState {
  chainId: string;
  sessionId: string;
  currentPhase: AttackPhase;
  steps: AttackStep[];
  completedPhases: AttackPhase[];
  startedAt: Date;
  updatedAt: Date;
  // สรุปข้อมูลสำคัญที่ค้นพบในแต่ละ phase (เพื่อไม่ให้ AI ลืม)
  phaseMemory: Record<AttackPhase, string[]>;
}

// ─── Phase transitions ──────────────────────────────────────────────

export const PHASE_ORDER: AttackPhase[] = [
  "recon",
  "enumeration",
  "exploitation",
  "post_exploitation",
  "reporting",
  "complete",
];

export const PHASE_LABELS: Record<AttackPhase, string> = {
  recon: "Reconnaissance",
  enumeration: "Enumeration",
  exploitation: "Exploitation",
  post_exploitation: "Post-Exploitation",
  reporting: "Reporting",
  complete: "Complete",
};

export function nextPhase(phase: AttackPhase): AttackPhase | null {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

// ─── AttackChain class ──────────────────────────────────────────────

export class AttackChain {
  state: AttackChainState;

  constructor(sessionId: string) {
    this.state = {
      chainId: uuidv4(),
      sessionId,
      currentPhase: "recon",
      steps: [],
      completedPhases: [],
      startedAt: new Date(),
      updatedAt: new Date(),
      phaseMemory: {
        recon: [],
        enumeration: [],
        exploitation: [],
        post_exploitation: [],
        reporting: [],
        complete: [],
      },
    };
  }

  get currentPhase(): AttackPhase {
    return this.state.currentPhase;
  }

  addStep(step: Omit<AttackStep, "stepId" | "timestamp" | "status">): AttackStep {
    const newStep: AttackStep = {
      ...step,
      stepId: uuidv4(),
      timestamp: new Date(),
      status: "pending",
    };
    this.state.steps.push(newStep);
    this.state.updatedAt = new Date();
    return newStep;
  }

  updateStep(stepId: string, updates: Partial<AttackStep>): void {
    const idx = this.state.steps.findIndex((s) => s.stepId === stepId);
    if (idx !== -1) {
      this.state.steps[idx] = { ...this.state.steps[idx], ...updates };
      this.state.updatedAt = new Date();
    }
  }

  markStepSuccess(stepId: string, result?: string, evidence?: string[]): void {
    this.updateStep(stepId, { status: "success", result, evidence });
  }

  markStepFailed(stepId: string, result?: string): void {
    this.updateStep(stepId, { status: "failed", result });
  }

  advancePhase(): AttackPhase | null {
    const next = nextPhase(this.state.currentPhase);
    if (!next) return null;
    this.state.completedPhases.push(this.state.currentPhase);
    this.state.currentPhase = next;
    this.state.updatedAt = new Date();
    return next;
  }

  setPhase(phase: AttackPhase): void {
    if (this.state.currentPhase !== phase) {
      this.state.completedPhases.push(this.state.currentPhase);
      this.state.currentPhase = phase;
      this.state.updatedAt = new Date();
    }
  }

  remember(phase: AttackPhase, memory: string): void {
    if (!this.state.phaseMemory[phase].includes(memory)) {
      this.state.phaseMemory[phase].push(memory);
      this.state.updatedAt = new Date();
    }
  }

  getPhaseMemory(phase: AttackPhase): string[] {
    return this.state.phaseMemory[phase];
  }

  getAllMemory(): string[] {
    return PHASE_ORDER.flatMap((p) => this.state.phaseMemory[p]);
  }

  // สร้าง prompt block เพื่อให้ AI รู้สถานะปัจจุบันของ attack chain
  toPromptBlock(): string {
    const sections: string[] = [
      `<attack_chain phase="${this.state.currentPhase}" label="${PHASE_LABELS[this.state.currentPhase]}">`,
    ];

    // Completed phases summary
    if (this.state.completedPhases.length > 0) {
      sections.push("## Completed Phases");
      for (const p of this.state.completedPhases) {
        const memories = this.state.phaseMemory[p];
        sections.push(`- ${PHASE_LABELS[p]}${memories.length ? `: ${memories.join("; ")}` : ""}`);
      }
    }

    // Current phase memory
    const currentMemories = this.state.phaseMemory[this.state.currentPhase];
    if (currentMemories.length > 0) {
      sections.push(`## ${PHASE_LABELS[this.state.currentPhase]} Findings`);
      for (const m of currentMemories) {
        sections.push(`- ${m}`);
      }
    }

    // Recent steps
    const recentSteps = this.state.steps.slice(-5);
    if (recentSteps.length > 0) {
      sections.push("## Recent Steps");
      for (const s of recentSteps) {
        sections.push(`- [${s.status.toUpperCase()}] ${s.action}${s.target ? ` → ${s.target}` : ""}${s.tool ? ` (${s.tool})` : ""}`);
      }
    }

    sections.push("</attack_chain>");
    return sections.join("\n");
  }

  isEmpty(): boolean {
    return this.state.steps.length === 0;
  }

  /** Serialize the state for persistence (Mongo/Redis). */
  toState(): AttackChainState {
    return this.state;
  }

  /** Rebuild an AttackChain from a previously persisted state. */
  static fromState(sessionId: string, state: Partial<AttackChainState>): AttackChain {
    const chain = new AttackChain(sessionId);
    const now = new Date();
    chain.state = {
      chainId: state.chainId || chain.state.chainId,
      sessionId,
      currentPhase: (PHASE_ORDER.includes(state.currentPhase as AttackPhase)
        ? (state.currentPhase as AttackPhase)
        : "recon"),
      steps: Array.isArray(state.steps) ? state.steps : [],
      completedPhases: Array.isArray(state.completedPhases)
        ? state.completedPhases.filter((p) => PHASE_ORDER.includes(p as AttackPhase))
        : [],
      startedAt: state.startedAt ? new Date(state.startedAt) : chain.state.startedAt,
      updatedAt: state.updatedAt ? new Date(state.updatedAt) : now,
      phaseMemory: {
        recon: state.phaseMemory?.recon ?? [],
        enumeration: state.phaseMemory?.enumeration ?? [],
        exploitation: state.phaseMemory?.exploitation ?? [],
        post_exploitation: state.phaseMemory?.post_exploitation ?? [],
        reporting: state.phaseMemory?.reporting ?? [],
        complete: state.phaseMemory?.complete ?? [],
      },
    };
    return chain;
  }
}

// ─── Target Memory (Vector DB-like store) ───────────────────────────
// จัดเก็บ Log จากเครื่องมือสแกน (Nmap, Burp, FFUF) ให้ AI ดึงข้อมูล
// เป้าหมายย้อนหลังมาวิเคราะห์ได้โดยไม่เสีย Token ไปกับ Context ทั้งหมด

export interface TargetMemoryEntry {
  id: string;
  sessionId: string;
  target: string;
  source: string; // e.g. "nmap", "burp", "ffuf", "manual"
  dataType: "host" | "service" | "port" | "url" | "finding" | "credential" | "note";
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class TargetMemoryStore {
  private entries: TargetMemoryEntry[] = [];

  constructor(private sessionId: string) {}

  /** Restore a previously persisted entry (preserves the original timestamp). */
  hydrate(entry: TargetMemoryEntry): void {
    this.entries.push(entry);
  }

  add(entry: Omit<TargetMemoryEntry, "id" | "sessionId" | "timestamp">): TargetMemoryEntry {
    const newEntry: TargetMemoryEntry = {
      ...entry,
      id: uuidv4(),
      sessionId: this.sessionId,
      timestamp: new Date(),
    };
    this.entries.push(newEntry);
    return newEntry;
  }

  query(target?: string, dataType?: string, source?: string, limit = 20): TargetMemoryEntry[] {
    let results = this.entries;
    if (target) {
      results = results.filter((e) =>
        e.target.toLowerCase().includes(target.toLowerCase()),
      );
    }
    if (dataType) {
      results = results.filter((e) => e.dataType === dataType);
    }
    if (source) {
      results = results.filter((e) => e.source === source);
    }
    return results.slice(-limit);
  }

  getByTarget(target: string): TargetMemoryEntry[] {
    return this.entries.filter((e) => e.target === target);
  }

  getAll(): TargetMemoryEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
  }

  // สร้าง summary block สำหรับ prompt (เฉพาะข้อมูลที่สำคัญ)
  toPromptBlock(target?: string, limit = 15): string {
    const entries = this.query(target, undefined, undefined, limit);
    if (entries.length === 0) return "";

    const sections: string[] = ["<target_memory>"];
    for (const e of entries) {
      const meta = e.metadata
        ? ` ${JSON.stringify(e.metadata)}`
        : "";
      sections.push(
        `- [${e.dataType}] ${e.target} (${e.source})${meta}: ${e.content}`,
      );
    }
    sections.push("</target_memory>");
    return sections.join("\n");
  }
}

// ─── Prompt formatting for persisted (DB) state ─────────────────────
// These helpers render raw persisted state — the same blocks the in-memory
// classes produce — so agent.service can inject them into the system prompt
// without reconstructing class instances.

export function formatAttackChainState(
  state: Partial<AttackChainState> | null | undefined,
): string {
  if (!state) return "";
  const hasSteps = Array.isArray(state.steps) && state.steps.length > 0;
  const memories = state.phaseMemory ?? {};
  const hasMemories = Object.values(memories).some(
    (arr) => Array.isArray(arr) && arr.length > 0,
  );
  if (!hasSteps && !hasMemories && state.currentPhase === "recon") return "";
  const chain = AttackChain.fromState(state.sessionId || "unknown", state);
  return chain.toPromptBlock();
}

export function formatTargetMemoryEntries(
  entries: TargetMemoryEntry[] | null | undefined,
): string {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const sections: string[] = ["<target_memory>"];
  for (const e of entries.slice(-15)) {
    const meta = e.metadata ? ` ${JSON.stringify(e.metadata)}` : "";
    sections.push(`- [${e.dataType}] ${e.target} (${e.source})${meta}: ${e.content}`);
  }
  sections.push("</target_memory>");
  return sections.join("\n");
}

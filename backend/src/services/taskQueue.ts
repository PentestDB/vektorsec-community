import { EventEmitter } from "events";
import { randomUUID } from "crypto";

// ─── Async Task Queue ───────────────────────────────────────────────
// งาน Pentest ที่ใช้เวลานาน (Nmap scan, FFUF brute force, SQLmap dump)
// ไม่ควรรันแบบ Synchronous ผ่าน HTTP Request ปกติ
// ระบบนี้จะรับงานไปรันใน Background และ Stream Output กลับมาแบบ Real-time

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface TaskDefinition {
  id: string;
  type: string;
  sessionId: string;
  userId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  payload: Record<string, any>;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  progress: number; // 0-100
  output: string[]; // streamed output chunks
  maxRetries: number;
  retryCount: number;
  timeoutMs: number;
  tags: string[];
}

export interface TaskHandler {
  (task: TaskDefinition, emit: (chunk: string) => void, updateProgress: (pct: number) => void): Promise<any>;
}

export interface TaskQueueOptions {
  concurrency?: number;
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
}

// ─── Task Queue Manager ─────────────────────────────────────────────

export class TaskQueueManager extends EventEmitter {
  private queue: TaskDefinition[] = [];
  private running = new Map<string, TaskDefinition>();
  private handlers = new Map<string, TaskHandler>();
  private options: TaskQueueOptions;
  private activeCount = 0;

  constructor(options: TaskQueueOptions = {}) {
    super();
    this.options = {
      concurrency: options.concurrency ?? 3,
      defaultTimeoutMs: options.defaultTimeoutMs ?? 300_000,
      defaultMaxRetries: options.defaultMaxRetries ?? 2,
    };
  }

  // Register a handler for a task type
  registerHandler(type: string, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  // Check if a handler is registered for a task type
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }


  // Enqueue a new task
  enqueue(params: {
    type: string;
    sessionId: string;
    userId?: string;
    payload: Record<string, any>;
    priority?: TaskPriority;
    timeoutMs?: number;
    maxRetries?: number;
    tags?: string[];
  }): TaskDefinition {
    const task: TaskDefinition = {
      id: randomUUID(),
      type: params.type,
      sessionId: params.sessionId,
      userId: params.userId,
      priority: params.priority ?? "normal",
      status: "queued",
      payload: params.payload,
      createdAt: new Date(),
      progress: 0,
      output: [],
      maxRetries: params.maxRetries ?? this.options.defaultMaxRetries!,
      retryCount: 0,
      timeoutMs: params.timeoutMs ?? this.options.defaultTimeoutMs!,
      tags: params.tags ?? [],
    };

    // Insert by priority (critical > high > normal > low)
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (priorityOrder[task.priority] < priorityOrder[this.queue[i].priority]) {
        insertIdx = i;
        break;
      }
    }
    this.queue.splice(insertIdx, 0, task);

    this.emit("task:queued", task);
    this.processNext();
    return task;
  }

  // Get task by ID
  getTask(taskId: string): TaskDefinition | undefined {
    return (
      this.queue.find((t) => t.id === taskId) ??
      this.running.get(taskId)
    );
  }

  // Get all tasks for a session
  getSessionTasks(sessionId: string): TaskDefinition[] {
    return [
      ...this.queue.filter((t) => t.sessionId === sessionId),
      ...Array.from(this.running.values()).filter((t) => t.sessionId === sessionId),
    ];
  }

  // Cancel a queued task
  cancel(taskId: string): boolean {
    const idx = this.queue.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;
    const task = this.queue[idx];
    task.status = "cancelled";
    this.queue.splice(idx, 1);
    this.emit("task:cancelled", task);
    return true;
  }

  // Get queue stats
  getStats(): { queued: number; running: number; completed: number; failed: number } {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: 0,
      failed: 0,
    };
  }

  /** List all queued + running tasks (for the admin monitor). */
  listTasks(): TaskDefinition[] {
    return [...this.queue, ...Array.from(this.running.values())];
  }


  // ─── Internal processing ──────────────────────────────────────────

  private processNext(): void {
    if (this.activeCount >= (this.options.concurrency ?? 3)) return;
    if (this.queue.length === 0) return;

    const task = this.queue.shift()!;
    this.activeCount++;
    task.status = "running";
    task.startedAt = new Date();
    this.running.set(task.id, task);
    this.emit("task:started", task);

    this.runTask(task).finally(() => {
      this.activeCount--;
      this.running.delete(task.id);
      this.processNext();
    });
  }

  private async runTask(task: TaskDefinition): Promise<void> {
    const handler = this.handlers.get(task.type);
    if (!handler) {
      task.status = "failed";
      task.error = `No handler registered for task type: ${task.type}`;
      task.completedAt = new Date();
      this.emit("task:failed", task);
      return;
    }

    const emit = (chunk: string) => {
      task.output.push(chunk);
      this.emit("task:output", task, chunk);
    };

    const updateProgress = (pct: number) => {
      task.progress = Math.max(0, Math.min(100, pct));
      this.emit("task:progress", task, task.progress);
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Task timed out after ${task.timeoutMs}ms`)), task.timeoutMs);
    });

    try {
      const result = await Promise.race([
        handler(task, emit, updateProgress),
        timeoutPromise,
      ]);
      task.status = "completed";
      task.result = result;
      task.progress = 100;
      task.completedAt = new Date();
      this.emit("task:completed", task);
    } catch (err: any) {
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = "queued";
        task.error = err.message ?? String(err);
        this.queue.unshift(task);
        this.emit("task:retry", task);
      } else {
        task.status = "failed";
        task.error = err.message ?? String(err);
        task.completedAt = new Date();
        this.emit("task:failed", task);
      }
    }
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let taskQueueInstance: TaskQueueManager | null = null;

export function getTaskQueue(): TaskQueueManager {
  if (!taskQueueInstance) {
    taskQueueInstance = new TaskQueueManager();
  }
  return taskQueueInstance;
}

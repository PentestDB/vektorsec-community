import { ToolDefinition, ToolResult, ExecutionContext } from "../tools/types";

const DEFAULT_TOOL_TIMEOUT_MS = 60_000; // 1 min hard cap if no timeoutMs on the definition

/**
 * Executes a tool with a hard timeout. Unlike a bare `Promise.race`, this
 * implementation also aborts the tool's underlying work (shell commands, etc.)
 * when the timeout fires, so long-running processes are actually cancelled
 * rather than left running in the background.
 *
 * The optional `abortSignal` is the caller's own cancellation signal (e.g. the
 * agent loop's pause/abort). When either the timeout or the caller's signal
 * fires, the tool is aborted and the promise rejects.
 */
export function executeWithTimeout(
  toolDef: ToolDefinition,
  args: Record<string, any>,
  ctx: ExecutionContext,
  abortSignal?: AbortSignal,
): Promise<ToolResult> {
  const timeoutMs = toolDef.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;

  // Create a dedicated controller for this tool call so we can abort the
  // underlying work on timeout without affecting the caller's signal.
  const toolAbort = new AbortController();

  const onCallerAbort = () => toolAbort.abort();
  if (abortSignal) {
    if (abortSignal.aborted) {
      toolAbort.abort();
    } else {
      abortSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  const timeoutTimer = setTimeout(() => {
    toolAbort.abort();
  }, timeoutMs);

  // Wrap the context so tools that read `ctx.abortSignal` (or pass it to
  // shell commands) observe the timeout/caller abort.
  const abortableCtx: ExecutionContext = {
    ...ctx,
    abortSignal: toolAbort.signal,
    runCommand: (command, t) =>
      ctx.runCommand(command, t ?? timeoutMs),
  };

  return toolDef
    .execute(args, abortableCtx)
    .then((result) => {
      clearTimeout(timeoutTimer);
      if (abortSignal) abortSignal.removeEventListener("abort", onCallerAbort);
      return result;
    })
    .catch((err: any) => {
      clearTimeout(timeoutTimer);
      if (abortSignal) abortSignal.removeEventListener("abort", onCallerAbort);
      if (toolAbort.signal.aborted && !(err?.name === "AbortError")) {
        const reason = abortSignal?.aborted
          ? "cancelled"
          : `timed out after ${timeoutMs / 1000}s`;
        throw new Error(`Tool '${toolDef.name}' ${reason}`);
      }
      throw err;
    });
}

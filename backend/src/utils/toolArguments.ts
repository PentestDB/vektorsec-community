/**
 * Parse the JSON object encoded in an LLM tool call.
 *
 * Models occasionally truncate a tool call after the inner object has been
 * closed, leaving one or more closing braces off the end.  We only repair
 * that specific, structurally unambiguous case.  In particular, we do not
 * attempt to fix quotes, commas, unquoted keys, trailing text, or arbitrary
 * syntax errors because doing so could change the command the model intended
 * to execute.
 */
export interface ParsedToolArguments {
  args: Record<string, any>;
  repaired: boolean;
}

function missingJsonClosers(input: string): string | null {
  if (!input.startsWith("{")) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of input) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
    }
  }

  // A missing quote means the parser cannot safely infer the intended value.
  if (inString || escaped || stack.length === 0) return null;

  return stack.reverse().join("");
}

export function parseToolArguments(rawArguments: string): ParsedToolArguments {
  if (typeof rawArguments !== "string") {
    throw new Error("tool arguments must be a JSON object encoded as a string");
  }

  const raw = rawArguments.trim();
  if (!raw) throw new Error("tool arguments are empty");

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("tool arguments must decode to a JSON object");
    }
    return { args: parsed as Record<string, any>, repaired: false };
  } catch (parseError) {
    const closers = missingJsonClosers(raw);
    if (closers) {
      try {
        const repaired = JSON.parse(raw + closers);
        if (repaired && typeof repaired === "object" && !Array.isArray(repaired)) {
          return { args: repaired as Record<string, any>, repaired: true };
        }
      } catch {
        // Fall through with the original parse error.  The repair was not
        // unambiguous or did not produce a valid object.
      }
    }

    const detail = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`invalid JSON tool arguments: ${detail}`);
  }
}

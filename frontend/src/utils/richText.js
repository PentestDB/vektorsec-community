/**
 * Light inline markup for translated strings.
 *
 * Setup guides are full sentences that embed command names and bold labels.
 * Putting the markup in the dictionary (instead of splitting the sentence into
 * JSX fragments) keeps each translation readable — the translator sees
 *   "run `sudo ./mythic-cli start` on your C2 host"
 * as one string:
 *
 *   `command`  → inline code
 *   **label**  → bold
 *
 * `parseRichText` is pure so it can be unit-tested without a DOM; the React
 * side lives in components/common/RichText.jsx.
 */

/** Matches one `code` or **strong** run; used with `split` to keep separators. */
const TOKEN_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*)/g;

/**
 * Split a string into `{ type, value }` tokens.
 *
 * Unbalanced markup (`"a `b"`) stays plain text — a half-translated dictionary
 * entry then renders literally instead of swallowing the rest of the sentence.
 */
export function parseRichText(text) {
  if (typeof text !== "string" || text === "") return [];

  return text
    .split(TOKEN_PATTERN)
    .filter((part) => part !== "")
    .map((part) => {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return { type: "code", value: part.slice(1, -1) };
      }
      if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
        return { type: "strong", value: part.slice(2, -2) };
      }
      return { type: "text", value: part };
    });
}

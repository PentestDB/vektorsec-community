// This file is deprecated. All inference goes through invoke_llm in utils/llm/providers.ts.
// Kept as a re-export for any lingering imports.
export { invoke_llm as chatCompletion } from "../llm/providers";

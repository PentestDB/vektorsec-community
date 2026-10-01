# Tool Plugins / Extensions

VektorSec keeps **one shared Tool Registry** (`backend/src/tools/registry.ts`)
as the single source of truth for everything an agent can call. The agent loop
and the MCP gateway both read from it, so **adding a tool to the registry makes
it available to both** — no core-loop changes required.

Plugins in this folder are **auto-loaded at startup** (`backend/src/tools/plugin-loader.ts`),
so you do not have to import them anywhere.

## Quick start (30 seconds)

```bash
cd backend/src/tools/extensions
cp example-plugin.ts.example my-plugin.ts   # `.example` files are ignored by the loader
# edit my-plugin.ts …
# restart the backend → "[plugins] loaded my-plugin.ts (tools: my_tool)"
```

Point the loader somewhere else (e.g. a mounted volume with customer plugins):

```bash
TOOLS_EXTENSIONS_DIR=/opt/vektorsec/plugins
```

- Dev: `tsx` loads the `.ts` file directly.
- Production image: `pnpm build` compiles the folder into `dist/tools/extensions/`,
  and the loader picks up the `.js` output instead.
- Files ignored by the loader: `README.md`, `*.d.ts`, `*.test.ts`, dotfiles, `index.*`,
  and anything without a `.ts`/`.js`/`.mjs`/`.cjs` extension (that is why the
  template is called `example-plugin.ts.example`).
- A plugin that throws is logged and skipped — it never takes the server down.
- The loader awaits each plugin's `register()`, so keep it fast (register tools,
  don't run long scans at load time). There is no timeout on a plugin that hangs.

## What a plugin must export

```ts
// named export (preferred)
export function register(): void | Promise<void> {
  registerTool(myTool);
}

// also supported
export default { register };
export default function register() { … }
```

## Public plugin API (`backend/src/tools/plugin.ts`)

| Function | Purpose |
|---|---|
| `defineTool(tool)` | Validate + normalise a `ToolDefinition` (name pattern, description, schema, execute) |
| `registerTool(tool, { overwrite? })` | Register one custom tool (throws on name collision unless `overwrite: true`) |
| `registerTools(tools[])` | Register several tools at once |
| `unregisterTool(name)` | Remove a tool (tests / opt-out plugins) |
| `isToolRegistered(name)` | Check availability |

### ToolDefinition (see `backend/src/tools/types.ts`)

```ts
{
  name: string;                    // lowercase snake_case, unique in registry
  description: string;             // what it does + when to use (model-facing)
  parameters: JSON Schema object;  // { type: "object", properties: {...} }
  timeoutMs?: number;              // default 30_000
  allowedRoles?: AgentRole[];      // default ["orchestrator","swarm_agent"]
  requiresConsent?: boolean;
  shouldRequireConsent?: (args, ctx) => boolean; // safety flags
  async execute(args, ctx): Promise<ToolResult>;
}
```

## Testing a plugin

Mirror `backend/tests/plugin.test.ts` (registry-level) and
`backend/tests/pluginLoader.test.ts` (the loader itself). Both run with
`cd backend && pnpm test`.

## Convention: keep logic outside handlers

Handlers should stay thin. Put parsing / risk-scoring / pure logic in
`backend/src/utils/*` (e.g. `scanOutput.ts`) and reuse the existing wrappers in
`backend/src/services/toolWrappers.ts`. Reuse `handlers/scan-guard.ts` for
SSRF + scope enforcement so a new network tool is safe by default.

## Related

- `backend/src/services/mcp-tools.service.ts` — MCP server surface. Custom
  registry tools are exposed via the backend-tool adapters; keep the MCP
  allow-list in sync when you publish a new capability to MCP clients.
- `docs/en/ROADMAP_NEXT.md` — plugin loading is tracked there along with the rest
  of the roadmap.

## Convention: keep logic outside handlers

Handlers should stay thin. Put parsing / risk-scoring / pure logic in
`backend/src/utils/*` (e.g. `scanOutput.ts`) and reuse the existing wrappers in
`backend/src/services/toolWrappers.ts`. Reuse `handlers/scan-guard.ts` for
SSRF + scope enforcement so a new network tool is safe by default.

## Related

- `backend/src/services/mcp-tools.service.ts` — MCP server surface. Custom
  registry tools are exposed via the backend-tool adapters; keep the MCP
  allow-list in sync when you publish a new capability to MCP clients.

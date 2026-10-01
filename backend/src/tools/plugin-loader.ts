import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { toolRegistry } from "./registry";

/**
 * Auto-load tool plugins from a directory.
 *
 * Drop a module into `backend/src/tools/extensions/` — or point
 * `TOOLS_EXTENSIONS_DIR` at any directory — that exports either
 *
 *   export function register(): void | Promise<void>   // named export
 *   export default { register }                        // or the default object
 *   export default function register() { … }           // or a default function
 *
 * and it is loaded at bootstrap. No core-loop, prompt or registry changes are
 * needed (see `backend/src/tools/extensions/README.md`).
 *
 * The same code works in dev (`tsx` → `.ts` files) and in the compiled image
 * (`dist` → `.js` files), because both extensions are accepted and everything
 * else (README.md, `*.d.ts`, `*.test.ts`, dotfiles, `index.*`) is skipped.
 *
 * A broken plugin never takes the server down: failures are collected in the
 * result and logged.
 */

export interface LoadedPlugin {
  /** File name (not the full path) of the plugin module. */
  file: string;
  ok: boolean;
  /** Tools registered while this plugin loaded. */
  registered: string[];
  error?: string;
}

export interface LoadPluginsResult {
  directory: string;
  /** True when the directory existed and was scanned. */
  directoryFound: boolean;
  scanned: number;
  loaded: number;
  failed: number;
  plugins: LoadedPlugin[];
}

const MODULE_EXTENSIONS = /\.(js|mjs|cjs|ts)$/;

/** Default plugin directory: next to this module (src/tools or dist/tools). */
export function resolvePluginDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.TOOLS_EXTENSIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(__dirname, "extensions");
}

/** True when a directory entry looks like a loadable plugin module. */
export function isPluginModuleFile(fileName: string): boolean {
  if (!fileName || fileName.startsWith(".")) return false;
  if (fileName.endsWith(".d.ts")) return false;
  if (/\.(test|spec)\.(ts|js|mjs|cjs)$/.test(fileName)) return false;
  if (!MODULE_EXTENSIONS.test(fileName)) return false;

  const base = fileName.replace(MODULE_EXTENSIONS, "");
  // Docs and barrel files are not plugins.
  if (base.toLowerCase() === "readme") return false;
  if (base === "index") return false;

  return true;
}

/**
 * Pick the exported `register` function out of a plugin module:
 * a named `register` export, a default object with `register`, or a default
 * function. Returns null when the module does not look like a plugin.
 */
export function resolveRegisterFn(
  mod: unknown,
): ((...args: unknown[]) => unknown) | null {
  const candidate = mod as {
    register?: unknown;
    default?: unknown;
  };

  if (typeof candidate?.register === "function") {
    return candidate.register as (...args: unknown[]) => unknown;
  }
  if (typeof candidate?.default === "function") {
    return candidate.default as (...args: unknown[]) => unknown;
  }
  const defaultObject = candidate?.default as { register?: unknown } | undefined;
  if (defaultObject && typeof defaultObject.register === "function") {
    return defaultObject.register as (...args: unknown[]) => unknown;
  }
  return null;
}

function registeredToolNames(): string[] {
  return toolRegistry.getAll().map((tool) => tool.name);
}

/**
 * Load every plugin in `directory` (defaults to `TOOLS_EXTENSIONS_DIR` or the
 * bundled `extensions/` folder). Never throws for a bad plugin.
 */
export async function loadPlugins(
  options: { directory?: string; log?: (message: string) => void } = {},
): Promise<LoadPluginsResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const directory = options.directory ?? resolvePluginDir();

  const result: LoadPluginsResult = {
    directory,
    directoryFound: false,
    scanned: 0,
    loaded: 0,
    failed: 0,
    plugins: [],
  };

  if (!fs.existsSync(directory)) {
    return result;
  }
  result.directoryFound = true;

  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isPluginModuleFile)
    .sort(); // deterministic load order

  result.scanned = files.length;

  for (const file of files) {
    const before = new Set(registeredToolNames());
    const fullPath = path.join(directory, file);

    try {
      const mod = await import(pathToFileURL(fullPath).href);
      const register = resolveRegisterFn(mod);

      if (!register) {
        result.failed += 1;
        result.plugins.push({
          file,
          ok: false,
          registered: [],
          error: "module does not export a register() function",
        });
        log(`[plugins] ${file} skipped — no register() export`);
        continue;
      }

      await register();
      const registered = registeredToolNames().filter((name) => !before.has(name));

      result.loaded += 1;
      result.plugins.push({ file, ok: true, registered });
      log(
        `[plugins] loaded ${file}` +
          (registered.length > 0 ? ` (tools: ${registered.join(", ")})` : ""),
      );
    } catch (error: any) {
      result.failed += 1;
      result.plugins.push({
        file,
        ok: false,
        registered: [],
        error: error?.message ?? String(error),
      });
      log(`[plugins] ${file} failed: ${error?.message ?? error}`);
    }
  }

  return result;
}

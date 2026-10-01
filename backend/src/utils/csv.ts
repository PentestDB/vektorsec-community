/**
 * Minimal CSV writer (RFC 4180) used by the export endpoints.
 *
 * Two things worth knowing:
 *  - Fields are always quoted when they contain a delimiter, quote or newline.
 *  - Values starting with `=`, `+`, `-`, `@`, tab or CR are prefixed with an
 *    apostrophe: Excel/Sheets would otherwise treat user-controlled content
 *    (finding titles, hostnames, commands) as a formula — CSV injection.
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

/** Escape one field for CSV output. */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  const guarded = DANGEROUS_PREFIX.test(raw) ? `'${raw}` : raw;

  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * Render rows as CSV (CRLF line endings for maximum spreadsheet compatibility).
 *
 * @param rows    objects to serialise
 * @param columns explicit column order; defaults to the union of the keys of
 *                every row (in first-seen order) so nothing is silently dropped.
 */
export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns?: string[],
): string {
  const list = rows ?? [];
  const header =
    columns && columns.length > 0
      ? [...columns]
      : Array.from(
          list.reduce((keys, row) => {
            for (const key of Object.keys(row ?? {})) keys.add(key);
            return keys;
          }, new Set<string>()),
        );

  const lines = [header.map((column) => escapeCsvField(column)).join(",")];
  for (const row of list) {
    lines.push(
      header.map((column) => escapeCsvField((row ?? {})[column])).join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}

/** `usage-2026-09-22.csv` — stable, filesystem-safe download name. */
export function csvFileName(prefix: string, date = new Date()): string {
  const safePrefix =
    String(prefix ?? "")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "export";
  return `${safePrefix}-${date.toISOString().slice(0, 10)}.csv`;
}

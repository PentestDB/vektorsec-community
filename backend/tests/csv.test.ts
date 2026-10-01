import assert from "node:assert/strict";
import { test } from "node:test";
import { csvFileName, escapeCsvField, toCsv } from "../src/utils/csv";

test("escapeCsvField leaves simple values untouched", () => {
  assert.equal(escapeCsvField("host.example.com"), "host.example.com");
  assert.equal(escapeCsvField(42), "42");
  assert.equal(escapeCsvField(1.5), "1.5");
  assert.equal(escapeCsvField(null), "");
  assert.equal(escapeCsvField(undefined), "");
});

test("escapeCsvField quotes delimiters, quotes and newlines", () => {
  assert.equal(escapeCsvField("a,b"), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
  assert.equal(escapeCsvField("crlf\r\n"), '"crlf\r\n"');
});

test("escapeCsvField neutralises spreadsheet formulas (CSV injection)", () => {
  assert.equal(escapeCsvField("=1+1"), "'=1+1");
  assert.equal(escapeCsvField("+SUM(A1)"), "'+SUM(A1)");
  assert.equal(escapeCsvField("-2+3"), "'-2+3");
  assert.equal(escapeCsvField("@cmd"), "'@cmd");
  // A leading pipe/quote is harmless, a leading equals is not.
  assert.equal(escapeCsvField("normal-title"), "normal-title");
});

test("escapeCsvField serialises dates and objects", () => {
  assert.equal(
    escapeCsvField(new Date("2026-09-22T00:00:00Z")),
    "2026-09-22T00:00:00.000Z",
  );
  assert.equal(escapeCsvField({ a: 1 }), '"{""a"":1}"');
});

test("toCsv renders a header plus one line per row with CRLF endings", () => {
  const csv = toCsv([
    { date: "2026-09-21", requests: 3, costUsd: 0.5 },
    { date: "2026-09-22", requests: 5, costUsd: 1.25 },
  ]);

  assert.equal(
    csv,
    "date,requests,costUsd\r\n2026-09-21,3,0.5\r\n2026-09-22,5,1.25\r\n",
  );
});

test("toCsv honours an explicit column order and fills missing values", () => {
  const csv = toCsv(
    [{ requests: 1 }, { requests: 2, tokens: 10 }],
    ["date", "requests", "tokens"],
  );

  assert.equal(csv, "date,requests,tokens\r\n,1,\r\n,2,10\r\n");
});

test("toCsv never drops columns that only appear in later rows", () => {
  const csv = toCsv([{ a: 1 }, { b: 2 }]);
  assert.equal(csv, "a,b\r\n1,\r\n,2\r\n");
});

test("toCsv handles an empty data set", () => {
  assert.equal(toCsv([]), "\r\n");
  assert.equal(toCsv([], ["a", "b"]), "a,b\r\n");
});

test("csvFileName builds a filesystem-safe download name", () => {
  assert.equal(csvFileName("usage", new Date("2026-09-22T10:00:00Z")), "usage-2026-09-22.csv");
  assert.equal(csvFileName("My Report!", new Date("2026-09-22T10:00:00Z")), "my-report-2026-09-22.csv");
  assert.equal(csvFileName("", new Date("2026-09-22T10:00:00Z")), "export-2026-09-22.csv");
});

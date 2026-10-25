import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Guard for `PrimaryButton` - the single custom button in the app, and the
 * child of several antd triggers (`Popconfirm`, `Tooltip`, `Dropdown`).
 *
 * antd resolves a trigger's DOM node through the child's `ref` (see
 * `@rc-component/trigger`'s `TriggerWrapper` / `rc-resize-observer`). React 19
 * hands that ref to function components as an ordinary prop, so a wrapper that
 * only re-passes a hand-picked prop list silently drops it and the trigger ends
 * up without a target element:
 *
 *   - the popup opens unpositioned (0,0) and is dismissed by the next click,
 *     because `inPopupOrChild()` cannot recognise the trigger node, and
 *   - rc-trigger logs `Warning: trigger element and popup element should in
 *     same shadow root.` (dev only).
 *
 * That was the VPN page's broken delete (trash) confirmation. Only the accent
 * flags may be extracted here - they are translated into CSS-module classes so
 * they never reach the DOM - plus `children`, `className` and `ref`. `ref` is
 * extracted deliberately (see the component comment) and therefore has to be
 * passed to `<Button>` explicitly; the second test enforces that pairing.
 */

const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const COMPONENT_FILE = path.join(SRC_DIR, "components", "common", "PrimaryButton.jsx");

// Mirrors `ACCENT_CLASSES` in the component: flags that become CSS classes.
const ACCENT_FLAGS = [
  "danger",
  "purple",
  "green",
  "yellow",
  "orange",
  "limegreen",
  "white",
  "disabled",
  "purpleFilled",
  "pinkFilled",
];
// `ref` is allowed only because it is forwarded explicitly (`ref={ref}` below).
const ALLOWED_DESTRUCTURED = new Set([...ACCENT_FLAGS, "children", "className", "ref"]);

const readComponent = () => fs.readFileSync(COMPONENT_FILE, "utf8");

/**
 * Comment-only lines are dropped before the JSX is matched: the component's own
 * comments mention `<Button>` in prose, which would otherwise be picked up as
 * the rendered element.
 */
const readComponentWithoutComments = () =>
  readComponent()
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

test("PrimaryButton only extracts accent flags from its props", () => {
  const source = readComponentWithoutComments();
  const destructuring = source.match(/const\s+PrimaryButton\s*=\s*\(\{([\s\S]*?)\}\)\s*=>/);

  assert.ok(
    destructuring,
    "could not locate PrimaryButton's props destructuring - update this guard when refactoring the component",
  );

  const extracted = destructuring[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("..."));

  for (const name of extracted) {
    assert.ok(
      ALLOWED_DESTRUCTURED.has(name),
      `"${name}" must not be destructured out of PrimaryButton's props: it would never reach antd's ` +
        "<Button>, and dropping `ref` breaks every Popconfirm/Tooltip/Dropdown that wraps this button.",
    );
  }
});

test("PrimaryButton spreads the remaining props onto antd's Button", () => {
  const source = readComponentWithoutComments();
  const buttonTags = [...source.matchAll(/<Button\b[\s\S]*?>/g)];
  const buttonTag = buttonTags[buttonTags.length - 1];

  assert.ok(buttonTag, "expected PrimaryButton to render an antd <Button>");

  const spreadIndex = buttonTag[0].search(/\{\s*\.\.\.\s*\w+\s*\}/);
  assert.ok(
    spreadIndex >= 0,
    "PrimaryButton must spread its remaining props onto <Button> (onClick, loading, icon, ...)",
  );

  const classNameIndex = buttonTag[0].indexOf("className=");
  assert.ok(
    classNameIndex === -1 || spreadIndex < classNameIndex,
    "spread the props before `className` so the computed accent classes are not overwritten",
  );
});

test("PrimaryButton forwards ref to antd's Button explicitly", () => {
  const source = readComponentWithoutComments();
  const buttonTags = [...source.matchAll(/<Button\b[\s\S]*?>/g)];
  const buttonTag = buttonTags[buttonTags.length - 1];

  assert.ok(buttonTag, "expected PrimaryButton to render an antd <Button>");

  // `ref` is destructured out of the props, so it is NOT part of the spread.
  // Without this explicit hand-over antd's triggers lose their DOM target and
  // the popup opens off-screen (rc-trigger's `-1000vw` "unpositioned" state).
  assert.match(
    buttonTag[0],
    /ref=\{\s*ref\s*\}/,
    "PrimaryButton extracts `ref`, so <Button> must receive it as `ref={ref}` - " +
      "Popconfirm/Tooltip/Dropdown popups are positioned from that DOM node.",
  );
});

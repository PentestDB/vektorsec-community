import { Button } from "antd";
import styles from "@/styles/components/Common.module.scss";

// Accent flags are translated into CSS-module classes. Keeping the list here
// means they never reach antd's <Button> as unknown props (antd forwards
// unknown props to the DOM node, which would emit React warnings).
const ACCENT_CLASSES = [
  ["danger", "dangerButton"],
  ["purple", "purpleButton"],
  ["green", "greenButton"],
  ["yellow", "yellowButton"],
  ["orange", "orangeButton"],
  ["limegreen", "limegreenButton"],
  ["white", "whiteButton"],
  ["disabled", "disabledButton"],
  ["purpleFilled", "purpleFilledButton"],
  ["pinkFilled", "pinkFilledButton"],
];

const PrimaryButton = ({
  className,
  children,
  // React 19 hands `ref` to function components as a regular prop. It is pulled
  // out explicitly instead of riding along in the rest object: `rc-util`'s
  // `getNodeRef` has to guard for `props.ref` being non-enumerable, and a
  // non-enumerable prop is silently dropped by an object rest spread.
  ref,
  danger,
  purple,
  green,
  yellow,
  orange,
  limegreen,
  white,
  disabled,
  purpleFilled,
  pinkFilled,
  ...buttonProps
}) => {
  const accentFlags = {
    danger,
    purple,
    green,
    yellow,
    orange,
    limegreen,
    white,
    disabled,
    purpleFilled,
    pinkFilled,
  };

  const buttonClassNames = [
    styles.submitButton,
    ...ACCENT_CLASSES.filter(([flag]) => accentFlags[flag]).map(
      ([, styleName]) => styles[styleName]
    ),
    className,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    // Everything else - including the trigger props antd injects (`onClick`,
    // `onKeyDown`, `aria-describedby`) - is forwarded to antd's Button. antd
    // trigger components (Popconfirm, Tooltip, Dropdown, Upload) resolve the
    // trigger DOM node through `ref`; when it was dropped, the confirmation
    // bubble opened unpositioned (off-screen at -1000vw) and rc-trigger logged
    // "trigger element and popup element should in same shadow root".
    <Button ref={ref} {...buttonProps} className={buttonClassNames} disabled={disabled}>
      {children}
    </Button>
  );
};

export default PrimaryButton;

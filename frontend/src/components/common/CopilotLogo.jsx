import React from "react";
import { FaShieldAlt } from "react-icons/fa";

// VektorSec brand logo: neon-cyan shield icon + wordmark.
// `plain` renders a slightly muted variant (used on auth/onboarding pages).
const CopilotLogo = ({ plain }) => {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        color: plain ? "rgba(0, 242, 254, 0.8)" : "#00f2fe",
        fontWeight: 700,
        letterSpacing: "0.08em",
        fontSize: "1.15rem",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",
        textShadow: "0 0 14px rgba(0, 242, 254, 0.45)",
      }}
    >
      <FaShieldAlt
        style={{
          color: plain ? "rgba(0, 242, 254, 0.65)" : "#00f2fe",
          fontSize: "1.35rem",
          flexShrink: 0,
          filter: "drop-shadow(0 0 6px rgba(0, 242, 254, 0.6))",
        }}
      />
      <span>VEKTORSEC</span>
    </span>
  );
};

export default CopilotLogo;


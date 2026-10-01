import React from "react";

// VektorSec brand logo (transparent lockup derived from logo/gemini-svg.svg):
// neon shield icon + VEKTORSEC wordmark rendered from /vektorsec-logo.svg.
// `plain` renders a slightly muted variant (used on auth/onboarding pages).
const CopilotLogo = ({ plain, height = 30 }) => {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vektorsec-logo.svg"
        alt="VektorSec"
        width={280}
        height={54}
        style={{
          display: "block",
          width: "auto",
          height,
          flexShrink: 0,
          opacity: plain ? 0.78 : 1,
          filter: plain ? "saturate(0.85)" : "none",
        }}
      />
    </span>
  );
};

export default CopilotLogo;


import React from "react";

const CopilotLogo = ({ plain }) => {
  return (
    <div className="pentest-copilot-logo">
      <div
        className={
          plain ? "pentest-copilot-logo-plain" : "pentest-copilot-logo-overlay"
        }
      />
    </div>
  );
};

export default CopilotLogo;

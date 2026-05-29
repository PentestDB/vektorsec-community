"use client";

import BurpProxyPage from "@/components/pages/session/burp/BurpProxyPage";
import {
  getCaidoConnectionStatus,
  getCaidoHttpHistory,
  getCaidoHttpEntry,
  sendCaidoRequest,
  sendToReplay,
  sendToAutomate,
  replaySend,
  getCaidoInterceptStatus,
  setCaidoIntercept,
} from "@/services/caido.service";

const CAIDO_INTEGRATION = {
  key: "caido",
  settingsKey: "caido",
  productName: "Caido",
  shortName: "Caido",
  historyTitle: "Caido HTTP History",
  notEnabledTitle: "Caido Not Enabled",
  notEnabledText:
    "Caido is not configured. Set the Caido URL and Personal Access Token in Settings to connect to your Caido instance.",
  notConnectedTitle: "Caido Not Connected",
  notConnectedText:
    "Caido is configured but cannot connect. Make sure Caido is running and listening on an address WSL can reach.",
  checkingText: "Checking Caido connection...",
  replayName: "Replay",
  sendViaReplayText: "Send via Replay",
  sendToReplayText: "To Caido",
  intruderName: "Automate",
  intruderSuccess: "Sent to Caido Automate",
  intruderError: "Failed to send to Caido Automate",
  interceptSupported: false,
  storageKey: "caido-to-workspace",
  queryPrefix: "caido",
  services: {
    getConnectionStatus: getCaidoConnectionStatus,
    getHistory: getCaidoHttpHistory,
    getEntry: getCaidoHttpEntry,
    sendRequest: sendCaidoRequest,
    sendToReplay,
    sendToIntruder: sendToAutomate,
    replaySend,
    getInterceptStatus: getCaidoInterceptStatus,
    setIntercept: setCaidoIntercept,
  },
};

const CaidoProxyPage = ({ sessionId }) => (
  <BurpProxyPage sessionId={sessionId} integration={CAIDO_INTEGRATION} />
);

export default CaidoProxyPage;

"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Table, Tag, Button, Empty, Spin, Modal, Switch, Select, Input, message } from "antd";
import {
  ReloadOutlined,
  WarningOutlined,
  SettingOutlined,
  SendOutlined,
  ExportOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import { TbRadar } from "react-icons/tb";
import { useQuery, useMutation } from "react-query";
import {
  getBurpConnectionStatus,
  getBurpProxyHistory,
  getBurpProxyEntry,
  sendBurpRequest,
  sendToRepeater,
  sendToIntruder,
  repeaterSend,
  getProxyInterceptStatus,
  setProxyIntercept,
  getBurpCaStatus,
  configureBurpCa,
} from "@/services/burp.service";
import styles from "@/styles/components/BurpProxy.module.scss";

const BURP_INTEGRATION = {
  key: "burp",
  settingsKey: "burp",
  productName: "Burp Suite",
  shortName: "Burp",
  historyTitle: "Proxy History",
  notEnabledTitle: "Burp Suite Not Enabled",
  notEnabledText:
    "Burp is not configured. Set the Burp RPC host and port in Settings to connect to your Burp Suite instance.",
  notConnectedTitle: "Burp Suite Not Connected",
  notConnectedText:
    "Burp is configured but cannot connect. Make sure Burp Suite with the RPC extension is running.",
  checkingText: "Checking Burp connection...",
  replayName: "Repeater",
  sendViaReplayText: "Send via Repeater",
  sendToReplayText: "To Burp",
  intruderName: "Intruder",
  intruderSuccess: "Sent to Burp Intruder",
  intruderError: "Failed to send to Intruder",
  interceptSupported: true,
  storageKey: "burp-to-workspace",
  queryPrefix: "burp",
  services: {
    getConnectionStatus: getBurpConnectionStatus,
    getHistory: getBurpProxyHistory,
    getEntry: getBurpProxyEntry,
    sendRequest: sendBurpRequest,
    sendToReplay: sendToRepeater,
    sendToIntruder,
    replaySend: repeaterSend,
    getInterceptStatus: getProxyInterceptStatus,
    setIntercept: setProxyIntercept,
    getCaStatus: getBurpCaStatus,
    configureCa: configureBurpCa,
  },
};

const METHOD_COLORS = {
  GET: "green",
  POST: "blue",
  PUT: "orange",
  PATCH: "gold",
  DELETE: "red",
  OPTIONS: "default",
  HEAD: "default",
};

function highlightHttpLine(line, lineIdx, isRequest, inBody) {
  if (inBody) {
    return <span className={styles.httpBody}>{line}</span>;
  }

  if (lineIdx === 0) {
    if (isRequest) {
      const match = line.match(/^(\S+)\s+(\S+)\s*(.*)/);
      if (match) {
        return (
          <>
            <span className={styles.httpMethod}>{match[1]}</span>
            {" "}
            <span className={styles.httpUrl}>{match[2]}</span>
            {match[3] && <> <span className={styles.httpVersion}>{match[3]}</span></>}
          </>
        );
      }
    } else {
      const match = line.match(/^(\S+)\s+(\d+)\s*(.*)/);
      if (match) {
        const code = parseInt(match[2], 10);
        let statusCls = styles.httpStatusOk;
        if (code >= 300 && code < 400) statusCls = styles.httpStatusRedirect;
        else if (code >= 400 && code < 500) statusCls = styles.httpStatusClientErr;
        else if (code >= 500) statusCls = styles.httpStatusServerErr;
        return (
          <>
            <span className={styles.httpVersion}>{match[1]}</span>
            {" "}
            <span className={statusCls}>{match[2]} {match[3]}</span>
          </>
        );
      }
    }
  }

  const headerMatch = line.match(/^([^:]+):\s*(.*)/);
  if (headerMatch) {
    return (
      <>
        <span className={styles.httpHeaderName}>{headerMatch[1]}</span>
        <span className={styles.httpHeaderValue}>: {headerMatch[2]}</span>
      </>
    );
  }

  return <span>{line}</span>;
}

const HttpCodeBlock = ({ content, isRequest = true }) => {
  const rendered = useMemo(() => {
    if (!content) return null;
    const lines = content.split("\n");
    let inBody = false;

    return lines.map((line, i) => {
      const cleaned = line.replace(/\r$/, "");
      if (!inBody && cleaned === "") {
        inBody = true;
      }
      return (
        <div className={styles.codeLine} key={i}>
          <span className={styles.lineNumber}>{i + 1}</span>
          <span className={styles.lineContent}>
            {highlightHttpLine(cleaned, i, isRequest, inBody && i > 0)}
          </span>
        </div>
      );
    });
  }, [content, isRequest]);

  if (!content) {
    return (
      <div className={styles.codeBlock}>
        <div className={styles.responsePlaceholder}>(empty)</div>
      </div>
    );
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeLines}>{rendered}</div>
    </div>
  );
};

const ExpandedRow = ({ record, onOpenRepeater, onSendToWorkspace, onSendToIntruder, integration }) => {
  const [activeTab, setActiveTab] = useState("request");

  const { data: fullEntry, isLoading: entryLoading } = useQuery(
    [`${integration.queryPrefix}-proxy-entry`, record.id],
    () => integration.services.getEntry(record.id),
    { staleTime: 30_000, refetchOnWindowFocus: false }
  );

  const mergedRecord = fullEntry ? { ...record, ...fullEntry } : record;

  return (
    <div className={styles.expandedRow}>
      <div className={styles.expandedHeader}>
        <div className={styles.expandedTabs}>
          <div
            className={activeTab === "request" ? styles.expandedTabActive : styles.expandedTab}
            onClick={() => setActiveTab("request")}
          >
            Request
          </div>
          <div
            className={activeTab === "response" ? styles.expandedTabActive : styles.expandedTab}
            onClick={() => setActiveTab("response")}
          >
            Response
          </div>
        </div>
        <div className={styles.expandedActions}>
          <Button
            size="small"
            icon={<RocketOutlined />}
            className={styles.workspaceBtn}
            disabled={entryLoading}
            onClick={(e) => {
              e.stopPropagation();
              onSendToWorkspace(mergedRecord);
            }}
          >
            Pentest
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            className={styles.repeaterBtn}
            disabled={entryLoading}
            onClick={(e) => {
              e.stopPropagation();
              onOpenRepeater(mergedRecord);
            }}
          >
            {integration.replayName}
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            className={styles.repeaterBtn}
            disabled={entryLoading}
            onClick={(e) => {
              e.stopPropagation();
              onSendToIntruder(mergedRecord);
            }}
          >
            {integration.intruderName}
          </Button>
        </div>
      </div>
      {entryLoading ? (
        <div className={styles.responsePlaceholder}>
          <Spin size="small" />
        </div>
      ) : (
        <HttpCodeBlock
          content={activeTab === "request" ? mergedRecord.rawRequest : mergedRecord.rawResponse}
          isRequest={activeTab === "request"}
        />
      )}
    </div>
  );
};

const RepeaterModal = ({ open, onClose, record, onSendToWorkspace, integration }) => {
  const [requestText, setRequestText] = useState("");
  const [targetHost, setTargetHost] = useState("");
  const [targetPort, setTargetPort] = useState(443);
  const [secure, setSecure] = useState(true);
  const [responseText, setResponseText] = useState("");
  const [responseTime, setResponseTime] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  const sendMutation = useMutation(integration.services.sendRequest, {
    onMutate: () => {
      setResponseTime(Date.now());
    },
    onSuccess: (data) => {
      const elapsed = Date.now() - responseTime;
      setResponseTime(elapsed);
      setResponseText(data.rawResponse || "(no response body)");
      message.success({ content: `Response received in ${elapsed}ms`, duration: 2 });
    },
    onError: (err) => {
      setResponseTime(null);
      const msg = err?.response?.data?.message || "Failed to send request";
      message.error({ content: msg, duration: 4 });
    },
  });

  const repeaterMutation = useMutation(integration.services.sendToReplay, {
    onSuccess: () => {
      message.success({ content: `Sent to ${integration.shortName} ${integration.replayName}`, duration: 2 });
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || `Failed to send to ${integration.replayName}`;
      message.error({ content: msg, duration: 4 });
    },
  });

  const repeaterSendMutation = useMutation(integration.services.replaySend, {
    onMutate: () => {
      setResponseTime(Date.now());
    },
    onSuccess: (data) => {
      const elapsed = Date.now() - responseTime;
      setResponseTime(elapsed);
      setResponseText(data.rawResponse || "(no response body)");
      message.success({ content: `${integration.replayName} response in ${elapsed}ms`, duration: 2 });
    },
    onError: (err) => {
      setResponseTime(null);
      const msg = err?.response?.data?.message || `Failed to send via ${integration.replayName}`;
      message.error({ content: msg, duration: 4 });
    },
  });

  const handleOpen = useCallback(async () => {
    if (!record) return;

    setTargetHost(record.host || "");
    setTargetPort(record.port || 443);
    setSecure(record.secure ?? true);
    setResponseText("");
    setResponseTime(null);

    if (record.rawRequest) {
      setRequestText(record.rawRequest);
    } else if (record.id != null) {
      setLoadingEntry(true);
      try {
        const full = await integration.services.getEntry(record.id);
        setRequestText(full.rawRequest || "");
      } catch {
        setRequestText("");
        message.error({ content: "Failed to load request details", duration: 3 });
      } finally {
        setLoadingEntry(false);
      }
    } else {
      setRequestText("");
    }
  }, [record]);

  const handleSend = () => {
    if (!targetHost.trim()) {
      message.warning({ content: "Host is required", duration: 2 });
      return;
    }
    if (!requestText.trim()) {
      message.warning({ content: "Request body is empty", duration: 2 });
      return;
    }
    sendMutation.mutate({
      host: targetHost,
      port: targetPort,
      secure,
      rawRequest: requestText,
    });
  };

  const handleSendToRepeater = () => {
    if (!targetHost.trim()) {
      message.warning({ content: "Host is required", duration: 2 });
      return;
    }
    repeaterMutation.mutate({
      host: targetHost,
      port: targetPort,
      secure,
      rawRequest: requestText,
      tabName: `${record?.method || "REQ"} ${record?.path || "/"}`,
    });
  };

  const handleRepeaterSend = () => {
    if (!targetHost.trim()) {
      message.warning({ content: "Host is required", duration: 2 });
      return;
    }
    if (!requestText.trim()) {
      message.warning({ content: "Request body is empty", duration: 2 });
      return;
    }
    repeaterSendMutation.mutate({
      host: targetHost,
      port: targetPort,
      secure,
      rawRequest: requestText,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={(visible) => visible && handleOpen()}
      width={1100}
      title={integration.replayName}
      className={styles.repeaterModal}
      footer={null}
      destroyOnClose
    >
      <div className={styles.repeaterMeta}>
        <div className={styles.metaField}>
          <label>Host</label>
          <input
            className={styles.hostInput}
            value={targetHost}
            onChange={(e) => setTargetHost(e.target.value)}
            placeholder="example.com"
          />
        </div>
        <div className={styles.metaField}>
          <label>Port</label>
          <input
            type="number"
            className={styles.portInput}
            value={targetPort}
            onChange={(e) => setTargetPort(parseInt(e.target.value, 10) || 443)}
          />
        </div>
        <div className={styles.metaToggle}>
          <span>TLS</span>
          <Switch size="small" checked={secure} onChange={setSecure} />
        </div>
      </div>

      <div className={styles.repeaterLayout}>
        <div className={styles.repeaterPane}>
          <div className={styles.repeaterPaneHeader}>
            <span className={styles.paneLabel}>Request</span>
            <div className={styles.paneActions}>

              <Button
                size="small"
                type="primary"
                icon={<SendOutlined />}
                loading={sendMutation.isLoading}
                disabled={loadingEntry}
                onClick={handleSend}
                className={styles.sendBtn}
              >
                Send
              </Button>
              <Button
                size="small"
                icon={<SendOutlined />}
                loading={repeaterSendMutation.isLoading}
                disabled={loadingEntry}
                onClick={handleRepeaterSend}
                className={styles.toBurpBtn}
              >
                {integration.sendViaReplayText}
              </Button>
              <Button
                size="small"
                icon={<ExportOutlined />}
                loading={repeaterMutation.isLoading}
                onClick={handleSendToRepeater}
                className={styles.toBurpBtn}
              >
                {integration.sendToReplayText}
              </Button>
              <Button
                size="small"
                icon={<RocketOutlined />}
                className={styles.workspaceBtnModal}
                onClick={() => {
                  onSendToWorkspace({
                    ...record,
                    rawRequest: requestText,
                    host: targetHost,
                    port: targetPort,
                    secure,
                  });
                  onClose();
                }}
              >
                Pentest
              </Button>
            </div>
          </div>
          <div className={styles.repeaterEditor}>
            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder={"GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"}
              spellCheck={false}
            />
          </div>
        </div>

        <div className={styles.repeaterPane}>
          <div className={styles.repeaterPaneHeader}>
            <span className={styles.paneLabel}>Response</span>
            {sendMutation.isLoading && <Spin size="small" />}
            {typeof responseTime === "number" && !sendMutation.isLoading && responseTime > 0 && (
              <span className={styles.responseTimeBadge}>{responseTime}ms</span>
            )}
          </div>
          <div className={styles.repeaterResponse}>
            {responseText ? (
              <HttpCodeBlock content={responseText} isRequest={false} />
            ) : (
              <div className={styles.responsePlaceholder}>
                {sendMutation.isLoading
                  ? "Waiting for response..."
                  : "Send a request to see the response"}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "2xx", label: "2xx Success" },
  { value: "3xx", label: "3xx Redirect" },
  { value: "4xx", label: "4xx Client Error" },
  { value: "5xx", label: "5xx Server Error" },
];

const METHOD_LIST = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const BurpProxyPage = ({ sessionId, integration = BURP_INTEGRATION }) => {
  const router = useRouter();
  const services = integration.services;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [repeaterOpen, setRepeaterOpen] = useState(false);
  const [repeaterRecord, setRepeaterRecord] = useState(null);

  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText, 400);
  const [methodFilter, setMethodFilter] = useState([]);
  const [statusRange, setStatusRange] = useState("");
  const [hideAssets, setHideAssets] = useState(false);

  const statusMin = statusRange ? parseInt(statusRange.charAt(0)) * 100 : 0;
  const statusMax = statusRange ? parseInt(statusRange.charAt(0)) * 100 + 99 : 0;
  const methodParam = methodFilter.join(",");

  const hasFilters = debouncedSearch || methodFilter.length > 0 || statusRange || hideAssets;

  const clearFilters = () => {
    setSearchText("");
    setMethodFilter([]);
    setStatusRange("");
    setHideAssets(false);
    setPage(1);
  };

  const prevFilterRef = useRef({ debouncedSearch, methodParam, statusRange, hideAssets });
  useEffect(() => {
    const prev = prevFilterRef.current;
    if (
      prev.debouncedSearch !== debouncedSearch ||
      prev.methodParam !== methodParam ||
      prev.statusRange !== statusRange ||
      prev.hideAssets !== hideAssets
    ) {
      setPage(1);
    }
    prevFilterRef.current = { debouncedSearch, methodParam, statusRange, hideAssets };
  }, [debouncedSearch, methodParam, statusRange, hideAssets]);

  const {
    data: connectionStatus,
    isLoading: connectionLoading,
    refetch: refetchConnection,
  } = useQuery(`${integration.queryPrefix}-connection-status`, services.getConnectionStatus, {
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const integrationConnected = connectionStatus?.connected === true;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    [`${integration.queryPrefix}-proxy-history`, page, pageSize, debouncedSearch, methodParam, statusRange, hideAssets],
    () =>
      services.getHistory({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        method: methodParam || undefined,
        statusMin: statusMin || undefined,
        statusMax: statusMax || undefined,
        hideAssets: hideAssets ? "true" : undefined,
      }),
    {
      enabled: integrationConnected,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  const { data: interceptData, refetch: refetchIntercept } = useQuery(
    [`${integration.queryPrefix}-intercept-status`],
    services.getInterceptStatus,
    { enabled: integrationConnected && integration.interceptSupported, refetchOnWindowFocus: false, retry: false }
  );

  const {
    data: caStatus,
    isLoading: caStatusLoading,
    refetch: refetchCaStatus,
  } = useQuery(
    [`${integration.queryPrefix}-ca-status`],
    services.getCaStatus,
    {
      enabled: integrationConnected && !!services.getCaStatus,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    }
  );

  const configureCaMutation = useMutation(services.configureCa, {
    onSuccess: (status) => {
      refetchCaStatus();
      if (status?.trusted) {
        message.success({ content: "Burp CA trusted by the Browser Agent", duration: 3 });
      } else {
        message.warning({ content: status?.message || "CA setup needs attention", duration: 4 });
      }
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || "Failed to configure Burp CA trust";
      message.error({ content: msg, duration: 5 });
    },
  });

  const interceptMutation = useMutation(
    (enabled) => services.setIntercept({ enabled }),
    {
      onSuccess: (_, enabled) => {
        refetchIntercept();
        message.success({
          content: `Proxy intercept ${enabled ? "enabled" : "disabled"}`,
          duration: 2,
        });
      },
      onError: (err) => {
        const msg = err?.response?.data?.message || "Failed to toggle intercept";
        message.error({ content: msg, duration: 3 });
      },
    }
  );

  const intruderMutation = useMutation(services.sendToIntruder, {
    onSuccess: () => {
      message.success({ content: integration.intruderSuccess, duration: 2 });
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || integration.intruderError;
      message.error({ content: msg, duration: 4 });
    },
  });

  const errMsg = error?.response?.data?.message || "";
  const notConfigured = connectionStatus?.configured === false;
  const configuredButDisconnected =
    connectionStatus?.configured === true && connectionStatus?.connected === false;

  const openRepeater = (record) => {
    setRepeaterRecord(record);
    setRepeaterOpen(true);
  };

  const handleSendToIntruder = useCallback(async (record) => {
    let fullRecord = record;
    if (!record.rawRequest && record.id != null) {
      try {
        fullRecord = { ...record, ...(await services.getEntry(record.id)) };
      } catch {
        message.error({ content: "Failed to load request details", duration: 3 });
        return;
      }
    }
    intruderMutation.mutate({
      host: fullRecord.host,
      port: fullRecord.port || 443,
      secure: fullRecord.secure ?? true,
      rawRequest: fullRecord.rawRequest || "",
      tabName: `${fullRecord.method || "REQ"} ${fullRecord.path || "/"}`,
    });
  }, [intruderMutation]);

  const sendToWorkspace = useCallback(async (record) => {
    let fullRecord = record;
    if (!record.rawRequest && record.id != null) {
      try {
        fullRecord = { ...record, ...(await services.getEntry(record.id)) };
      } catch {
        message.error({ content: "Failed to load request details", duration: 3 });
        return;
      }
    }
    const attachment = {
      method: fullRecord.method,
      host: fullRecord.host,
      port: fullRecord.port || 443,
      path: fullRecord.path,
      secure: !!fullRecord.secure,
      rawRequest: fullRecord.rawRequest || "",
      rawResponse: fullRecord.rawResponse || "",
      statusCode: fullRecord.statusCode,
      sourceName: integration.shortName,
    };
    sessionStorage.setItem(integration.storageKey, JSON.stringify(attachment));
    router.push(`/session/${sessionId}`);
    message.success({ content: "Request attached to workspace", duration: 2 });
  }, [sessionId, router]);

  const columns = [
    {
      title: "#",
      dataIndex: "index",
      key: "index",
      width: 50,
      render: (val) => <span className={styles.lengthCell}>{val}</span>,
    },
    {
      title: "Method",
      dataIndex: "method",
      key: "method",
      width: 80,
      render: (method) => (
        <Tag color={METHOD_COLORS[method] || "default"} className={styles.methodTag}>
          {method}
        </Tag>
      ),
    },
    {
      title: "Host",
      dataIndex: "host",
      key: "host",
      width: 180,
      render: (host, record) => (
        <span className={styles.hostCell}>
          {host}
          {record.secure && <span className={styles.tlsIndicator}>TLS</span>}
        </span>
      ),
    },
    {
      title: "Path",
      dataIndex: "path",
      key: "path",
      ellipsis: true,
      render: (path) => <span className={styles.pathCell}>{path}</span>,
    },
    {
      title: "Status",
      dataIndex: "statusCode",
      key: "statusCode",
      width: 65,
      render: (code) => {
        if (!code) return <span className={styles.lengthCell}>&mdash;</span>;
        let cls = styles.statusCode;
        if (code >= 200 && code < 300) cls += ` ${styles.status2xx}`;
        else if (code >= 300 && code < 400) cls += ` ${styles.status3xx}`;
        else if (code >= 400 && code < 500) cls += ` ${styles.status4xx}`;
        else if (code >= 500) cls += ` ${styles.status5xx}`;
        return <span className={cls}>{code}</span>;
      },
    },
    {
      title: "Type",
      dataIndex: "contentType",
      key: "contentType",
      width: 140,
      ellipsis: true,
      render: (ct) => <span className={styles.contentTypeCell}>{ct || "\u2014"}</span>,
    },
    {
      title: "Size",
      dataIndex: "responseLength",
      key: "responseLength",
      width: 70,
      render: (len) => {
        if (!len) return <span className={styles.lengthCell}>&mdash;</span>;
        if (len > 1024 * 1024) {
          return <span className={styles.lengthCell}>{(len / (1024 * 1024)).toFixed(1)}M</span>;
        }
        if (len > 1024) {
          return <span className={styles.lengthCell}>{(len / 1024).toFixed(1)}K</span>;
        }
        return <span className={styles.lengthCell}>{len}B</span>;
      },
    },
    {
      title: "",
      key: "actions",
      width: 36,
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          icon={<SendOutlined style={{ fontSize: "0.65rem" }} />}
          className={styles.actionBtn}
          onClick={(e) => {
            e.stopPropagation();
            openRepeater(record);
          }}
          title={`Open in ${integration.replayName}`}
        />
      ),
    },
  ];

  if (connectionLoading) {
    return (
      <div className={styles.burpContainer}>
        <div className={styles.emptyState}>
          <Spin size="large" />
          <p style={{ marginTop: "1rem" }}>{integration.checkingText}</p>
        </div>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className={styles.burpContainer}>
        <div className={styles.emptyState}>
          <TbRadar className={styles.emptyIcon} />
          <h3>{integration.notEnabledTitle}</h3>
          <p>{integration.notEnabledText}</p>
          <Button
            type="primary"
            size="small"
            icon={<SettingOutlined />}
            className={styles.configureBtn}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-settings", { detail: integration.settingsKey }));
            }}
          >
            Enable in Settings
          </Button>
        </div>
      </div>
    );
  }

  if (configuredButDisconnected) {
    return (
      <div className={styles.burpContainer}>
        <div className={styles.emptyState}>
          <TbRadar className={styles.emptyIcon} />
          <h3>{integration.notConnectedTitle}</h3>
          <p>
            {connectionStatus?.message ||
              integration.notConnectedText}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <Button
              type="primary"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => refetchConnection()}
            >
              Retry Connection
            </Button>
            <Button
              size="small"
              icon={<SettingOutlined />}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-settings", { detail: integration.settingsKey }));
              }}
            >
              Check Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.burpContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.headerTitle}>{integration.historyTitle}</h2>
          {data?.total != null && (
            <span className={styles.entryCount}>{data.total}</span>
          )}
        </div>
        <div className={styles.headerRight}>
          {caStatus?.trusted && (
            <div className={styles.caReadyBadge} title={caStatus.fingerprint || "Burp CA trusted"}>
              <CheckCircleFilled /> HTTPS ready
            </div>
          )}
          {integration.interceptSupported && <div className={styles.interceptToggle}>
            <span>Intercept</span>
            <Switch
              size="small"
              checked={interceptData?.enabled ?? false}
              loading={interceptMutation.isLoading}
              onChange={(checked) => interceptMutation.mutate(checked)}
            />
          </div>}
          <Button
            icon={<ReloadOutlined spin={isFetching} />}
            onClick={() => refetch()}
            disabled={isFetching}
            size="small"
            className={styles.refreshBtn}
          >
            Refresh
          </Button>
        </div>
      </div>

      {services.getCaStatus && !caStatusLoading && !caStatus?.trusted && (
        <div className={styles.caSetupCard}>
          <div className={styles.caSetupIcon}>
            <SafetyCertificateOutlined />
          </div>
          <div className={styles.caSetupCopy}>
            <strong>{caStatus?.needsRefresh ? "Refresh Burp HTTPS trust" : "Enable HTTPS interception"}</strong>
            <span>
              {caStatus?.message || "Trust Burp's CA in the isolated Browser Agent profile."}
            </span>
            {caStatus?.fingerprint && (
              <code title={caStatus.fingerprint}>SHA-256 {caStatus.fingerprint}</code>
            )}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<SafetyCertificateOutlined />}
            loading={configureCaMutation.isLoading}
            disabled={!caStatus?.certificateAvailable}
            onClick={() => configureCaMutation.mutate()}
            className={styles.caSetupButton}
          >
            {caStatus?.needsRefresh ? "Refresh CA trust" : "Configure in one click"}
          </Button>
        </div>
      )}

      {services.getCaStatus && caStatusLoading && (
        <div className={styles.caCheckingBar}>
          <Spin size="small" /> Checking HTTPS interception readiness…
        </div>
      )}

      <div className={styles.filterBar}>
        <Input
          placeholder="Search host, path, type..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          className={styles.filterSearch}
        />
        <div className={styles.filterDivider} />
        <div className={styles.filterMethods}>
          {METHOD_LIST.map((m) => (
            <Tag.CheckableTag
              key={m}
              checked={methodFilter.includes(m)}
              onChange={(checked) =>
                setMethodFilter((prev) =>
                  checked ? [...prev, m] : prev.filter((v) => v !== m)
                )
              }
              className={styles.filterMethodTag}
            >
              {m}
            </Tag.CheckableTag>
          ))}
        </div>
        <div className={styles.filterDivider} />
        <Select
          value={statusRange}
          onChange={setStatusRange}
          options={STATUS_OPTIONS}
          className={styles.filterStatus}
          popupMatchSelectWidth={false}
          size="small"
        />
        <div className={styles.filterDivider} />
        <div className={styles.filterToggle}>
          <span>Hide assets</span>
          <Switch size="small" checked={hideAssets} onChange={setHideAssets} />
        </div>
        {hasFilters && (
          <Button
            type="text"
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={clearFilters}
            className={styles.filterClear}
          >
            Clear
          </Button>
        )}
      </div>

      {isError && !notConfigured && (
        <div className={styles.errorBanner}>
          <WarningOutlined />
          {error?.response?.data?.message || "Failed to fetch proxy history"}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <Table
          columns={columns}
          dataSource={data?.entries || []}
          rowKey={(record) => `${record.index}`}
          loading={isLoading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total: data?.total || 0,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
            showTotal: (total, range) => (
              <span className={styles.lengthCell}>
                {range[0]}&ndash;{range[1]} of {total}
              </span>
            ),
          }}
          expandable={{
            expandedRowRender: (record) => (
              <ExpandedRow
                record={record}
                onOpenRepeater={openRepeater}
                onSendToWorkspace={sendToWorkspace}
                onSendToIntruder={handleSendToIntruder}
                integration={integration}
              />
            ),
            expandRowByClick: true,
          }}
          locale={{
            emptyText: isLoading ? (
              <Spin size="small" />
            ) : (
              <Empty
                description="No proxy history entries"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
        />
      </div>

      <RepeaterModal
        open={repeaterOpen}
        onClose={() => setRepeaterOpen(false)}
        record={repeaterRecord}
        onSendToWorkspace={sendToWorkspace}
        integration={integration}
      />
    </div>
  );
};

export default BurpProxyPage;

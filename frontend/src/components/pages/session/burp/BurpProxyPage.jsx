"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, Tag, Button, Empty, Spin, Modal, Switch, message } from "antd";
import {
  ReloadOutlined,
  WarningOutlined,
  SettingOutlined,
  SendOutlined,
  ExportOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { TbRadar } from "react-icons/tb";
import { useQuery, useMutation } from "react-query";
import {
  getBurpProxyHistory,
  sendBurpRequest,
  sendToRepeater,
} from "@/services/burp.service";
import styles from "@/styles/components/BurpProxy.module.scss";

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
        <div style={{ padding: "1rem", color: "var(--secondary-text-500)", fontSize: "0.68rem" }}>
          (empty)
        </div>
      </div>
    );
  }

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeLines}>{rendered}</div>
    </div>
  );
};

const ExpandedRow = ({ record, onOpenRepeater, onSendToWorkspace }) => {
  const [activeTab, setActiveTab] = useState("request");

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
            onClick={(e) => {
              e.stopPropagation();
              onSendToWorkspace(record);
            }}
          >
            Pentest
          </Button>
          <Button
            size="small"
            icon={<SendOutlined />}
            className={styles.repeaterBtn}
            onClick={(e) => {
              e.stopPropagation();
              onOpenRepeater(record);
            }}
          >
            Repeater
          </Button>
        </div>
      </div>
      <HttpCodeBlock
        content={activeTab === "request" ? record.rawRequest : record.rawResponse}
        isRequest={activeTab === "request"}
      />
    </div>
  );
};

const RepeaterModal = ({ open, onClose, record, onSendToWorkspace }) => {
  const [requestText, setRequestText] = useState("");
  const [targetHost, setTargetHost] = useState("");
  const [targetPort, setTargetPort] = useState(443);
  const [secure, setSecure] = useState(true);
  const [responseText, setResponseText] = useState("");
  const [responseTime, setResponseTime] = useState(null);

  const sendMutation = useMutation(sendBurpRequest, {
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

  const repeaterMutation = useMutation(sendToRepeater, {
    onSuccess: () => {
      message.success({ content: "Sent to Burp Repeater tab", duration: 2 });
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || "Failed to send to Repeater";
      message.error({ content: msg, duration: 4 });
    },
  });

  const handleOpen = useCallback(() => {
    if (record) {
      setRequestText(record.rawRequest || "");
      setTargetHost(record.host || "");
      setTargetPort(record.port || 443);
      setSecure(record.secure ?? true);
      setResponseText("");
      setResponseTime(null);
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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      afterOpenChange={(visible) => visible && handleOpen()}
      width={1100}
      title="Repeater"
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
                onClick={handleSend}
                className={styles.sendBtn}
              >
                Send
              </Button>
              <Button
                size="small"
                icon={<ExportOutlined />}
                loading={repeaterMutation.isLoading}
                onClick={handleSendToRepeater}
                className={styles.toBurpBtn}
              >
                To Burp
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

const BurpProxyPage = ({ sessionId }) => {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [repeaterOpen, setRepeaterOpen] = useState(false);
  const [repeaterRecord, setRepeaterRecord] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery(
    ["burp-proxy-history", page, pageSize],
    () => getBurpProxyHistory({ page, pageSize }),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: 1,
    }
  );

  const notConfigured = error?.response?.data?.notConfigured;

  const openRepeater = (record) => {
    setRepeaterRecord(record);
    setRepeaterOpen(true);
  };

  const sendToWorkspace = useCallback((record) => {
    const attachment = {
      method: record.method,
      host: record.host,
      port: record.port || 443,
      path: record.path,
      secure: !!record.secure,
      rawRequest: record.rawRequest || "",
      rawResponse: record.rawResponse || "",
      statusCode: record.statusCode,
    };
    sessionStorage.setItem("burp-to-workspace", JSON.stringify(attachment));
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
          title="Open in Repeater"
        />
      ),
    },
  ];

  if (notConfigured) {
    return (
      <div className={styles.burpContainer}>
        <div className={styles.emptyState}>
          <TbRadar className={styles.emptyIcon} />
          <h3>Burp Suite Not Configured</h3>
          <p>
            Set the Burp RPC host and port in Settings to connect to your Burp Suite instance.
          </p>
          <Button
            type="primary"
            size="small"
            icon={<SettingOutlined />}
            className={styles.configureBtn}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-settings", { detail: "burp" }));
            }}
          >
            Configure
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.burpContainer}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>Proxy History</h2>
          {data?.total != null && (
            <span className={styles.entryCount}>{data.total}</span>
          )}
        </div>
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
              <span style={{ fontSize: "0.62rem", color: "var(--secondary-text-500)", fontFamily: "'JetBrains Mono', monospace" }}>
                {range[0]}&ndash;{range[1]} of {total}
              </span>
            ),
          }}
          expandable={{
            expandedRowRender: (record) => (
              <ExpandedRow record={record} onOpenRepeater={openRepeater} onSendToWorkspace={sendToWorkspace} />
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
      />
    </div>
  );
};

export default BurpProxyPage;

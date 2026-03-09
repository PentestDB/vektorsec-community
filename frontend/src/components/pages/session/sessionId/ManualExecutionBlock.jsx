import React, { useState, useCallback } from "react";
import { Button, Input, message } from "antd";
import { CopyOutlined, CheckOutlined } from "@ant-design/icons";
import styles from "@/styles/components/Chat.module.scss";

const { TextArea } = Input;

export default function ManualExecutionBlock({ pending, onSubmit }) {
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pending.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error("Failed to copy to clipboard");
    }
  }, [pending.command]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    try {
      await onSubmit(output);
    } finally {
      setSubmitting(false);
    }
  }, [output, onSubmit]);

  return (
    <div className={styles.manualExecBlock}>
      <div className={styles.manualExecHeader}>
        <span className={styles.manualExecIcon}>&#9881;</span>
        <span className={styles.manualExecTitle}>
          SSH not connected — run this command manually
        </span>
      </div>

      <div className={styles.manualExecCommand}>
        <pre>{pending.command}</pre>
        <button
          className={styles.manualExecCopyBtn}
          onClick={handleCopy}
          title="Copy command"
        >
          {copied ? <CheckOutlined /> : <CopyOutlined />}
        </button>
      </div>

      <div className={styles.manualExecOutputArea}>
        <TextArea
          value={output}
          onChange={(e) => setOutput(e.target.value)}
          placeholder="Paste the command output here..."
          rows={6}
          className={styles.manualExecTextarea}
        />
      </div>

      <div className={styles.manualExecActions}>
        <Button
          type="primary"
          onClick={handleSubmit}
          loading={submitting}
          disabled={!output.trim()}
        >
          Submit Output
        </Button>
        <Button
          onClick={() => onSubmit("(command skipped by user)")}
          disabled={submitting}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

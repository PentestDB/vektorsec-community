"use client";

import { useEffect, useState } from "react";
import {
  getMcpTokens,
  revokeMcpToken,
  createMcpTokenForUser,
  setMcpTokenLimit,
  getUsers,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminMcpTokens = () => {
  const [tokens, setTokens] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create-token form
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState(null);

  // Per-user token-limit modal
  const [limitUser, setLimitUser] = useState(null);
  const [limitValue, setLimitValue] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const loadTokens = async () => {
    try {
      const data = await getMcpTokens();
      setTokens(data.tokens || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load MCP tokens");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await loadTokens();
        const userData = await getUsers({ limit: 50 }).catch(() => null);
        setUsers(userData?.users || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRevoke = async (userId, tokenId) => {
    if (!window.confirm("Revoke this MCP token? The integration will stop working immediately.")) return;
    setError("");
    setSuccess("");
    try {
      await revokeMcpToken(userId, tokenId);
      setSuccess("Token revoked successfully");
      await loadTokens();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to revoke token");
    }
  };

  const handleCreate = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }
    setError("");
    setSuccess("");
    setCreatedToken(null);
    setCreating(true);
    try {
      const data = await createMcpTokenForUser(selectedUserId, newLabel.trim() || "Admin created");
      setCreatedToken(data?.token || null);
      setSuccess("MCP token created successfully");
      setNewLabel("");
      setShowCreate(false);
      await loadTokens();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveLimit = async () => {
    if (!limitUser) return;
    setError("");
    setSuccess("");
    setSavingLimit(true);
    try {
      const parsed = limitValue === "" ? null : parseInt(limitValue, 10);
      await setMcpTokenLimit(limitUser.userId, parsed);
      setSuccess(`Token limit updated for ${limitUser.userName}`);
      setLimitUser(null);
      setLimitValue("");
      await loadTokens();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update token limit");
    } finally {
      setSavingLimit(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading MCP tokens...</div>;
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>MCP Tokens</h1>
        <p className={styles.pageSubtitle}>
          Create, manage and revoke MCP integration tokens across all users.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Create token */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className={styles.cardTitle}>Create MCP Token</h2>
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "Cancel" : "+ New Token"}
          </button>
        </div>

        {showCreate && (
          <div className={styles.filterRow} style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
            <select
              className={styles.select}
              style={{ minWidth: 220 }}
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select user...</option>
              {users.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <input
              className={styles.input}
              style={{ minWidth: 180 }}
              type="text"
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create Token"}
            </button>
          </div>
        )}

        {createdToken && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <strong style={{ color: "#4ade80" }}>Token created — copy it now, it will not be shown again:</strong>
            <pre style={{ margin: "8px 0 0", padding: 10, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 6, color: "#e2e8f0", fontSize: 12, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
              {createdToken.token}
            </pre>
          </div>
        )}
      </div>

      {/* Active tokens */}
      <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>Active Tokens ({activeTokens.length})</h2>
      {activeTokens.length === 0 ? (
        <div className={styles.empty}>No active MCP tokens found.</div>
      ) : (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Token</th>
                <th>User</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeTokens.map((t) => (
                <tr key={t.tokenId}>
                  <td>
                    <strong>{t.label || "Unnamed token"}</strong>
                    <div>
                      <span className={styles.badge} style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                        {t.tokenId}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div>{t.userName || "Unknown"}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{t.userEmail || ""}</div>
                  </td>
                  <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "N/A"}</td>
                  <td>{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "Never"}</td>
                  <td>
                    <button
                      className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                      style={{ marginRight: 6 }}
                      onClick={() => {
                        setLimitUser(t);
                        setLimitValue(t.tokenLimit != null ? String(t.tokenLimit) : "");
                      }}
                    >
                      Limit
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                      onClick={() => handleRevoke(t.userId, t.tokenId)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revoked tokens */}
      {revokedTokens.length > 0 && (
        <>
          <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>Revoked Tokens ({revokedTokens.length})</h2>
          <div className={styles.card}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>User</th>
                  <th>Created</th>
                  <th>Revoked</th>
                </tr>
              </thead>
              <tbody>
                {revokedTokens.map((t) => (
                  <tr key={t.tokenId} style={{ opacity: 0.6 }}>
                    <td>
                      <strong>{t.label || "Unnamed token"}</strong>
                      <div>
                        <span className={styles.badge} style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                          {t.tokenId}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div>{t.userName || "Unknown"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{t.userEmail || ""}</div>
                    </td>
                    <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "N/A"}</td>
                    <td>{t.revokedAt ? new Date(t.revokedAt).toLocaleString() : "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Token limit modal */}
      {limitUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setLimitUser(null)}
        >
          <div
            className={styles.card}
            style={{ width: 400, maxWidth: "90vw" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={styles.cardTitle}>MCP Token Limit</h2>
            <p style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
              Override the plan limit for {limitUser.userName} ({limitUser.userEmail}). Leave empty to use the plan default.
            </p>
            <input
              className={styles.input}
              type="number"
              min="0"
              placeholder="e.g. 10 (empty = plan default)"
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              style={{ marginTop: 12 }}
            />
            <div className={styles.filterRow} style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                onClick={() => setLimitUser(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
                onClick={handleSaveLimit}
                disabled={savingLimit}
              >
                {savingLimit ? "Saving..." : "Save Limit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMcpTokens;

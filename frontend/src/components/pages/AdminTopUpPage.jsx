"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getTopUpPackagesAdmin,
  saveTopUpPackage,
  deleteTopUpPackage,
  creditTokens,
} from "@/services/payment.service";
import { getUsers } from "@/services/admin.service";
import styles from "./AdminTopUpPage.module.scss";

const AdminTopUpPage = () => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Package form
  const [editing, setEditing] = useState(null); // null | "new" | packageId
  const [form, setForm] = useState({});

  // Manual credit
  const [users, setUsers] = useState([]);
  const [creditForm, setCreditForm] = useState({ userId: "", tokens: "" });

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getTopUpPackagesAdmin();
      setPackages(data.packages || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load top-up packages");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await load();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [load]);

  const loadUsers = async () => {
    try {
      const data = await getUsers({ page: 1, limit: 100 });
      setUsers(data.users || []);
    } catch (err) {
      // Non-fatal
    }
  };

  const openNew = () => {
    setEditing("new");
    setForm({
      packageId: "",
      name: "",
      description: "",
      priceUsd: "",
      tokens: "",
      enabled: true,
      sortOrder: 0,
    });
  };

  const openEdit = (pkg) => {
    setEditing(pkg.packageId);
    setForm({
      packageId: pkg.packageId,
      name: pkg.name || "",
      description: pkg.description || "",
      priceUsd: pkg.priceUsd ?? "",
      tokens: pkg.tokens ?? "",
      enabled: !!pkg.enabled,
      sortOrder: pkg.sortOrder ?? 0,
    });
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const body = {
        packageId: form.packageId.trim(),
        name: form.name.trim(),
        description: form.description.trim(),
        priceUsd: Number(form.priceUsd) || 0,
        tokens: Number(form.tokens) || 0,
        enabled: !!form.enabled,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (!body.packageId) {
        setError("Package ID is required (e.g. topup100, topup500)");
        return;
      }
      await saveTopUpPackage(body);
      setSuccess(editing === "new" ? "Top-up package created" : `Package "${body.packageId}" updated`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save top-up package");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pkg) => {
    setError("");
    setSuccess("");
    try {
      await saveTopUpPackage({
        packageId: pkg.packageId,
        name: pkg.name,
        description: pkg.description,
        priceUsd: pkg.priceUsd,
        tokens: pkg.tokens,
        enabled: !pkg.enabled,
        sortOrder: pkg.sortOrder,
      });
      setSuccess(`Package "${pkg.packageId}" ${pkg.enabled ? "disabled" : "enabled"}`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to toggle package");
    }
  };

  const handleDelete = async (pkg) => {
    if (!window.confirm(`Delete top-up package "${pkg.packageId}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteTopUpPackage(pkg.packageId);
      setSuccess(`Package "${pkg.packageId}" deleted`);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete package");
    }
  };

  const handleCredit = async () => {
    if (!creditForm.userId || !creditForm.tokens) {
      setError("Select a user and enter token amount.");
      return;
    }
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const data = await creditTokens(creditForm.userId, Number(creditForm.tokens));
      setSuccess(data.message || "Tokens credited");
      setCreditForm({ userId: "", tokens: "" });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to credit tokens");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading top-up packages...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Top-up Packages</h1>
        <p className={styles.subtitle}>
          Configure token top-up packages. Set your own price and the number of
          tokens credited when a customer pays.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Active Packages</div>
          <div className={styles.statValue}>{packages.filter((p) => p.enabled).length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Packages</div>
          <div className={styles.statValue}>{packages.length}</div>
        </div>
      </div>

      {/* Package list */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Packages</h2>
          <button className={styles.saveBtn} onClick={openNew}>
            New Package
          </button>
        </div>

        {packages.length === 0 ? (
          <div className={styles.empty}>
            No top-up packages yet. Create one to start selling tokens.
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Package</th>
                <th>Price (USD)</th>
                <th>Tokens</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.packageId}>
                  <td>
                    <strong>{p.name}</strong>
                    <span className={styles.packageId}>{p.packageId}</span>
                    {p.description && <div className={styles.packageDesc}>{p.description}</div>}
                  </td>
                  <td>${p.priceUsd}</td>
                  <td>{p.tokens.toLocaleString()}</td>
                  <td>
                    {p.enabled ? (
                      <span className={`${styles.badge} ${styles.badgeOn}`}>Enabled</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeOff}`}>Disabled</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actionRow}>
                      <button className={styles.editBtn} onClick={() => openEdit(p)}>
                        Edit
                      </button>
                      <button className={styles.toggleBtn} onClick={() => handleToggle(p)}>
                        {p.enabled ? "Disable" : "Enable"}
                      </button>
                      <button className={styles.dangerBtn} onClick={() => handleDelete(p)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>


      {/* Create/Edit form */}
      {editing && (
        <div className={styles.modalOverlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {editing === "new" ? "New Top-up Package" : `Edit ${editing}`}
            </h2>

            {editing === "new" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Package ID</span>
                <input
                  className={styles.input}
                  value={form.packageId}
                  onChange={(e) => setForm({ ...form, packageId: e.target.value })}
                  placeholder="e.g. topup100, topup500"
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="100 Tokens"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Description</span>
              <input
                className={styles.input}
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional short description"
              />
            </label>

            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Price (USD)</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  value={form.priceUsd ?? ""}
                  onChange={(e) => setForm({ ...form, priceUsd: e.target.value })}
                  placeholder="100"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Tokens</span>
                <input
                  className={styles.input}
                  type="number"
                  min="1"
                  value={form.tokens ?? ""}
                  onChange={(e) => setForm({ ...form, tokens: e.target.value })}
                  placeholder="100000"
                />
              </label>
            </div>

            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Sort Order</span>
                <input
                  className={styles.input}
                  type="number"
                  value={form.sortOrder ?? 0}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Enabled</span>
                <label className={styles.switchWrap}>
                  <input
                    type="checkbox"
                    className={styles.switchInput}
                    checked={!!form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  <span className={`${styles.switch} ${form.enabled ? styles.switchOn : ""}`}>
                    <span className={styles.switchKnob} />
                  </span>
                </label>
              </label>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Manual credit */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Manual Token Credit</h2>
        <p className={styles.fieldHint}>
          Credit tokens to a user directly (e.g. manual bank transfer that the
          customer paid outside the app).
        </p>
        <div className={styles.formRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>User</span>
            <select
              className={styles.select}
              value={creditForm.userId}
              onChange={(e) => setCreditForm({ ...creditForm, userId: e.target.value })}
              onFocus={loadUsers}
            >
              <option value="">Select user...</option>
              {users.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.email} ({u.name || u._id})
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tokens</span>
            <input
              className={styles.input}
              type="number"
              min="1"
              value={creditForm.tokens}
              onChange={(e) => setCreditForm({ ...creditForm, tokens: e.target.value })}
              placeholder="100000"
            />
          </label>
          <div className={styles.creditBtnWrap}>
            <button className={styles.saveBtn} onClick={handleCredit} disabled={saving}>
              {saving ? "Crediting..." : "Credit Tokens"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTopUpPage;


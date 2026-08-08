"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "@/services/menu.service";
import styles from "../admin.module.scss";

const EMPTY_FORM = {
  label: "",
  url: "",
  order: 0,
  enabled: true,
  openInNewTab: false,
  locked: false,
  placement: "navbar",
};

const AdminMenuLinks = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listMenuItems();
      setList(data.menus || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load menu items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      label: item.label || "",
      url: item.url || "",
      order: item.order ?? 0,
      enabled: item.enabled !== false,
      openInNewTab: item.openInNewTab === true,
      locked: item.locked === true,
      placement: item.placement || "navbar",
    });
    setShowModal(true);
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    if (!form.url.trim()) {
      setError("URL is required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      label: form.label.trim(),
      url: form.url.trim(),
      order: Number(form.order) || 0,
      enabled: form.enabled,
      openInNewTab: form.openInNewTab,
      locked: form.locked,
      placement: form.placement,
    };
    try {
      if (editing) {
        await updateMenuItem(editing._id, payload);
        setSuccess("Menu item updated");
      } else {
        await createMenuItem(payload);
        setSuccess("Menu item created");
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save menu item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete menu item "${item.label}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteMenuItem(item._id);
      setSuccess("Menu item deleted");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete menu item");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading menu items...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Menu Links</h1>
        <p className={styles.pageSubtitle}>
          Add, edit or remove custom menu tabs shown in the platform navigation.
          Items are rendered in order after the default links.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className={styles.cardTitle}>Menu Items</h2>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
            + New Menu Item
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Order</th>
              <th>Label</th>
              <th>URL</th>
              <th>Placement</th>
              <th>New Tab</th>
              <th>Locked</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#8c8c8c" }}>
                  No custom menu items yet. Add your first one!
                </td>
              </tr>
            )}
            {list.map((item) => (
              <tr key={item._id}>
                <td>{item.order ?? 0}</td>
                <td>
                  <strong>{item.label}</strong>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: 12.5 }}>{item.url}</td>
                <td>{item.placement || "navbar"}</td>
                <td>{item.openInNewTab ? "Yes" : "No"}</td>
                <td>
                  {item.locked === true ? (
                    <span className={`${styles.badge} ${styles.badgeYellow}`}>Locked</span>
                  ) : (
                    <span className={styles.badgeGray}>—</span>
                  )}
                </td>
                <td>
                  {item.enabled !== false ? (
                    <span className={`${styles.badge} ${styles.badgeGreen}`}>Enabled</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.badgeGray}`}>Disabled</span>
                  )}
                </td>
                <td>
                  <div className={styles.actionRow}>
                    <button
                      className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                      onClick={() => openEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                      onClick={() => handleDelete(item)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {editing ? "Edit Menu Item" : "New Menu Item"}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Label
              </label>
              <input
                className={styles.input}
                value={form.label}
                onChange={(e) => handleChange("label", e.target.value)}
                placeholder="e.g. Blog"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                URL
              </label>
              <input
                className={styles.input}
                value={form.url}
                onChange={(e) => handleChange("url", e.target.value)}
                placeholder="/blog or https://..."
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Order (lower = first)
              </label>
              <input
                className={styles.input}
                type="number"
                value={form.order}
                onChange={(e) => handleChange("order", e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Placement
              </label>
              <select
                className={styles.select}
                value={form.placement}
                onChange={(e) => handleChange("placement", e.target.value)}
              >
                <option value="navbar">Navbar</option>
                <option value="header">Header</option>
                <option value="session">Session Sidebar</option>
                <option value="both">Both (Navbar + Header)</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 24, margin: "12px 0", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => handleChange("enabled", e.target.checked)}
                />
                Enabled
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.openInNewTab}
                  onChange={(e) => handleChange("openInNewTab", e.target.checked)}
                />
                Open in new tab
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.locked}
                  onChange={(e) => handleChange("locked", e.target.checked)}
                />
                Locked (Pro plan badge)
              </label>
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setShowModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminMenuLinks;

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/services/announcement.service";
import styles from "../admin.module.scss";

const EMPTY_FORM = {
  title: "",
  message: "",
  enabled: true,
  dismissible: true,
  startsAt: "",
  endsAt: "",
};

function toLocalInput(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const AdminAnnouncements = () => {
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
      const data = await listAnnouncements();
      setList(data.announcements || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load announcements");
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
      title: item.title || "",
      message: item.message || "",
      enabled: item.enabled !== false,
      dismissible: item.dismissible !== false,
      startsAt: toLocalInput(item.startsAt),
      endsAt: toLocalInput(item.endsAt),
    });
    setShowModal(true);
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      title: form.title.trim(),
      message: form.message,
      enabled: form.enabled,
      dismissible: form.dismissible,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    };
    try {
      if (editing) {
        await updateAnnouncement(editing._id, payload);
        setSuccess("Announcement updated");
      } else {
        await createAnnouncement(payload);
        setSuccess("Announcement created");
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save announcement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete announcement "${item.title}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteAnnouncement(item._id);
      setSuccess("Announcement deleted");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete announcement");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading announcements...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Announcements</h1>
        <p className={styles.pageSubtitle}>
          Announcements pop up on every page of the frontend for your users.
          Set an optional start/end window to schedule them.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className={styles.cardTitle}>Announcement List</h2>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
            + New Announcement
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Schedule</th>
              <th>Dismissible</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#8c8c8c" }}>
                  No announcements yet. Create your first one!
                </td>
              </tr>
            )}
            {list.map((item) => {
              const now = new Date();
              const started = !item.startsAt || new Date(item.startsAt) <= now;
              const ended = item.endsAt && new Date(item.endsAt) < now;
              const active = item.enabled && started && !ended;
              return (
                <tr key={item._id}>
                  <td>
                    <strong>{item.title}</strong>
                  </td>
                  <td>
                    {active ? (
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeGray}`}>
                        {item.enabled ? "Scheduled/Ended" : "Disabled"}
                      </span>
                    )}
                  </td>
                  <td>
                    {item.startsAt || item.endsAt
                      ? `${item.startsAt ? new Date(item.startsAt).toLocaleString() : "now"} → ${
                          item.endsAt ? new Date(item.endsAt).toLocaleString() : "∞"
                        }`
                      : "Always"}
                  </td>
                  <td>{item.dismissible !== false ? "Yes" : "No"}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString()}</td>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {editing ? "Edit Announcement" : "New Announcement"}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Title
              </label>
              <input
                className={styles.input}
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="e.g. Scheduled maintenance"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Message (HTML supported)
              </label>
              <textarea
                className={styles.input}
                rows={6}
                value={form.message}
                onChange={(e) => handleChange("message", e.target.value)}
                placeholder="<p>We will be performing maintenance on...</p>"
              />
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
                  checked={form.dismissible}
                  onChange={(e) => handleChange("dismissible", e.target.checked)}
                />
                User can dismiss
              </label>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                  Starts at (optional)
                </label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => handleChange("startsAt", e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                  Ends at (optional)
                </label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => handleChange("endsAt", e.target.value)}
                />
              </div>
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

export default AdminAnnouncements;

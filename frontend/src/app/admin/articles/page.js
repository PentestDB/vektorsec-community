"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
} from "@/services/blog.service";
import styles from "../admin.module.scss";

const EMPTY_FORM = {
  title: "",
  description: "",
  content: "",
  coverImage: "",
  author: "VektorSec",
  category: "security",
  status: "draft",
};

const STATUS_BADGE = {
  published: "badgeGreen",
  draft: "badgeGray",
  archived: "badgeYellow",
};

const AdminArticles = () => {
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
      const data = await listArticles();
      setList(data.articles || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load articles");
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
      description: item.description || "",
      content: item.content || "",
      coverImage: item.coverImage || "",
      author: item.author || "VektorSec",
      category: item.category || "security",
      status: item.status || "draft",
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
      description: form.description,
      content: form.content,
      coverImage: form.coverImage,
      author: form.author,
      category: form.category,
      status: form.status,
    };
    try {
      if (editing) {
        await updateArticle(editing._id, payload);
        setSuccess("Article updated");
      } else {
        await createArticle(payload);
        setSuccess("Article created");
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save article");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete article "${item.title}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteArticle(item._id);
      setSuccess("Article deleted");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete article");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading articles...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Articles</h1>
        <p className={styles.pageSubtitle}>
          Write and manage articles shown on the public blog page. Only
          articles with status "published" are visible to visitors.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className={styles.cardTitle}>Article List</h2>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
            + New Article
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Category</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "#8c8c8c" }}>
                  No articles yet. Write your first one!
                </td>
              </tr>
            )}
            {list.map((item) => (
              <tr key={item._id}>
                <td>
                  <strong>{item.title}</strong>
                  {item.slug && (
                    <div style={{ fontSize: 12, color: "#8c8c8c", fontFamily: "monospace" }}>
                      /blog/{item.slug}
                    </div>
                  )}
                </td>
                <td>{item.author || "VektorSec"}</td>
                <td>{item.category || "security"}</td>
                <td>
                  <span className={`${styles.badge} ${styles[STATUS_BADGE[item.status] || "badgeGray"]}`}>
                    {item.status || "draft"}
                  </span>
                </td>
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
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {editing ? "Edit Article" : "New Article"}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Title
              </label>
              <input
                className={styles.input}
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Article title"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Short description
              </label>
              <input
                className={styles.input}
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="One-line summary shown on the blog list"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Content (HTML supported)
              </label>
              <textarea
                className={styles.input}
                rows={10}
                value={form.content}
                onChange={(e) => handleChange("content", e.target.value)}
                placeholder="<h2>...</h2><p>...</p>"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                Cover image URL (optional)
              </label>
              <input
                className={styles.input}
                value={form.coverImage}
                onChange={(e) => handleChange("coverImage", e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                  Author
                </label>
                <input
                  className={styles.input}
                  value={form.author}
                  onChange={(e) => handleChange("author", e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                  Category
                </label>
                <input
                  className={styles.input}
                  value={form.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "#8c8c8c" }}>
                  Status
                </label>
                <select
                  className={styles.select}
                  value={form.status}
                  onChange={(e) => handleChange("status", e.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
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

export default AdminArticles;

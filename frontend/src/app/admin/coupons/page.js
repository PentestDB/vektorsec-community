"use client";

import { useEffect, useState } from "react";
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modal, setModal] = useState(null); // null | "new" | couponId
  const [form, setForm] = useState({});

  const loadCoupons = async () => {
    try {
      const data = await getCoupons();
      setCoupons(data.coupons || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load coupons");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await loadCoupons();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const openNew = () => {
    setModal("new");
    setForm({
      couponIds: "",
      creditAmount: 0,
      exploitBoxAmount: 0,
      expiryDate: "",
      status: "active",
      description: "",
      maxRedeem: 10,
    });
  };

  const openEdit = (coupon) => {
    setModal(coupon._id);
    setForm({
      couponIds: (coupon.couponIds || []).join(", "),
      creditAmount: coupon.creditAmount || 0,
      exploitBoxAmount: coupon.exploitBoxAmount || 0,
      expiryDate: coupon.expiryDate ? coupon.expiryDate.split("T")[0] : "",
      status: coupon.status || "active",
      description: coupon.description || "",
      maxRedeem: coupon.maxRedeem || 10,
    });
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    try {
      const body = {
        couponIds: (form.couponIds || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        creditAmount: Number(form.creditAmount) || 0,
        exploitBoxAmount: Number(form.exploitBoxAmount) || 0,
        expiryDate: form.expiryDate || undefined,
        status: form.status,
        description: form.description,
        maxRedeem: Number(form.maxRedeem) || 10,
      };

      if (modal === "new") {
        await createCoupon(body);
        setSuccess("Coupon created successfully");
      } else {
        await updateCoupon(modal, body);
        setSuccess("Coupon updated successfully");
      }
      setModal(null);
      await loadCoupons();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save coupon");
    }
  };

  const handleDelete = async (couponId) => {
    if (!window.confirm("Delete this coupon? This cannot be undone.")) return;
    setError("");
    setSuccess("");
    try {
      await deleteCoupon(couponId);
      setSuccess("Coupon deleted successfully");
      await loadCoupons();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete coupon");
    }
  };

  const statusBadge = (status) => {
    const map = {
      active: "Green",
      inactive: "Gray",
      expired: "Red",
    };
    return map[status] || "Gray";
  };

  if (loading) {
    return <div className={styles.loading}>Loading coupons...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Coupons</h1>
        <p className={styles.pageSubtitle}>Manage discount and credit coupons.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.filterRow}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={openNew}>
          + New Coupon
        </button>
      </div>

      {coupons.length === 0 ? (
        <div className={styles.empty}>No coupons found.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Coupon Codes</th>
                <th>Credit</th>
                <th>Exploit Box</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Redeemed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c._id}>
                  <td>
                    {(c.couponIds || []).map((id) => (
                      <span key={id} className={`${styles.badge} ${styles.badgeBlue}`} style={{ marginRight: 4 }}>
                        {id}
                      </span>
                    ))}
                  </td>
                  <td>${c.creditAmount || 0}</td>
                  <td>{c.exploitBoxAmount || 0}</td>
                  <td>{c.expiryDate ? new Date(c.expiryDate).toLocaleDateString() : "N/A"}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`badge${statusBadge(c.status)}`]}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{(c.redeemedBy || []).length} / {c.maxRedeem}</td>
                  <td>
                    <div className={styles.actionRow}>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                        onClick={() => handleDelete(c._id)}
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
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {modal === "new" ? "New Coupon" : "Edit Coupon"}
            </h2>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Coupon Codes (comma separated)</label>
              <input
                className={styles.input}
                value={form.couponIds || ""}
                onChange={(e) => setForm({ ...form, couponIds: e.target.value })}
                placeholder="e.g. SAVE10, WELCOME20"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Credit Amount ($)</label>
                <input
                  className={styles.input}
                  type="number"
                  value={form.creditAmount ?? 0}
                  onChange={(e) => setForm({ ...form, creditAmount: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Exploit Box Amount</label>
                <input
                  className={styles.input}
                  type="number"
                  value={form.exploitBoxAmount ?? 0}
                  onChange={(e) => setForm({ ...form, exploitBoxAmount: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Expiry Date</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.expiryDate || ""}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Max Redeem</label>
                <input
                  className={styles.input}
                  type="number"
                  value={form.maxRedeem ?? 10}
                  onChange={(e) => setForm({ ...form, maxRedeem: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Status</label>
              <select
                className={styles.select}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Description</label>
              <textarea
                className={styles.input}
                rows={2}
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description"
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCoupons;

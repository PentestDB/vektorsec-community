"use client";

import { useEffect, useState } from "react";
import {
  getUsers,
  createUser,
  blockUser,
  unblockUser,
  updateUserRole,
  updateUserPlan,
  resetUserPassword,
  resetUserTwoFactor,
  deleteUser,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [resetTarget, setResetTarget] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [resetting, setResetting] = useState(false);

  // Add-user modal
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "pentester", plan: "free" });
  const [adding, setAdding] = useState(false);
  const [resetting2fa, setResetting2fa] = useState(false);

  const loadUsers = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      const data = await getUsers(params);
      setUsers(data.users || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load users");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await loadUsers();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [search, roleFilter, statusFilter]);

  const handleBlock = async (userId) => {
    const reason = window.prompt("Reason for blocking this user:");
    if (reason === null) return;
    setError("");
    setSuccess("");
    try {
      await blockUser(userId, reason);
      setSuccess("User blocked successfully");
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to block user");
    }
  };

  const handleUnblock = async (userId) => {
    setError("");
    setSuccess("");
    try {
      await unblockUser(userId);
      setSuccess("User unblocked successfully");
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to unblock user");
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    setError("");
    setSuccess("");
    try {
      await deleteUser(userId);
      setSuccess("User deleted successfully");
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete user");
    }
  };

  const openResetPassword = (user) => {
    setError("");
    setSuccess("");
    setResetTarget(user);
    setPasswordForm({ newPassword: "", confirmPassword: "" });
  };

  const handleResetPassword = async () => {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError("Please fill in both password fields.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setSuccess("");
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.uid, passwordForm.newPassword);
      setSuccess(`Password reset successfully for ${resetTarget.name || resetTarget.email}`);
      setResetTarget(null);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const handleAddUser = async () => {
    setError("");
    setSuccess("");
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password) {
      setError("Name, email and password are required.");
      return;
    }
    if (addForm.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setAdding(true);
    try {
      await createUser({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        role: addForm.role,
        plan: addForm.plan,
      });
      setSuccess("User created successfully");
      setAddOpen(false);
      setAddForm({ name: "", email: "", password: "", role: "pentester", plan: "free" });
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create user");
    } finally {
      setAdding(false);
    }
  };

  const handleReset2fa = async (user) => {
    if (!window.confirm(`Reset two-factor authentication for ${user.name || user.email}?`)) return;
    setError("");
    setSuccess("");
    setResetting2fa(true);
    try {
      await resetUserTwoFactor(user.uid);
      setSuccess(`Two-factor authentication reset for ${user.name || user.email}`);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reset 2FA");
    } finally {
      setResetting2fa(false);
    }
  };

  const openEdit = (user) => {
    setEditingUser(user.uid);
    setEditForm({
      role: user.role || "pentester",
      plan: user.plan || "free",
      planExpiresAt: user.planExpiresAt ? user.planExpiresAt.split("T")[0] : "",
    });
  };

  const handleSaveEdit = async () => {
    setError("");
    setSuccess("");
    try {
      await updateUserRole(editingUser, editForm.role);
      await updateUserPlan(editingUser, editForm.plan, editForm.planExpiresAt || undefined);
      setSuccess("User updated successfully");
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update user");
    }
  };

  const roleBadge = (role) => {
    const map = {
      admin: "Purple",
      pentester: "Blue",
      user: "Gray",
    };
    return map[role] || "Gray";
  };

  if (loading) {
    return <div className={styles.loading}>Loading users...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 className={styles.pageTitle}>Users</h1>
            <p className={styles.pageSubtitle}>Manage user accounts, roles, and access.</p>
          </div>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => {
              setError("");
              setSuccess("");
              setAddForm({ name: "", email: "", password: "", role: "pentester", plan: "free" });
              setAddOpen(true);
            }}
          >
            + Add User
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.filterRow}>
        <input
          className={styles.input}
          style={{ maxWidth: 300 }}
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="pentester">Pentester</option>
          <option value="user">User</option>
        </select>
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {users.length === 0 ? (
        <div className={styles.empty}>No users found.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td>
                    <strong>{u.name}</strong>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`badge${roleBadge(u.role)}`]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>{u.plan || "free"}</td>
                  <td>
                    {u.isBlocked ? (
                      <span className={`${styles.badge} ${styles.badgeRed}`}>Blocked</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                    )}
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className={styles.actionRow}>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => openResetPassword(u)}
                      >
                        Reset Password
                      </button>
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => handleReset2fa(u)}
                        disabled={resetting2fa}
                        title={u.twoFactorEnabled ? "Disable 2FA for this user" : "2FA is already off"}
                      >
                        {u.twoFactorEnabled ? "Reset 2FA" : "2FA Off"}
                      </button>
                      {u.isBlocked ? (
                        <button
                          className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSmall}`}
                          onClick={() => handleUnblock(u.uid)}
                        >
                          Unblock
                        </button>
                      ) : (
                        <button
                          className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                          onClick={() => handleBlock(u.uid)}
                        >
                          Block
                        </button>
                      )}
                      <button
                        className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                        onClick={() => handleDelete(u.uid)}
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

      {editingUser && (
        <div className={styles.modalOverlay} onClick={() => setEditingUser(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Edit User</h2>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Role</label>
              <select
                className={styles.select}
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                <option value="admin">Admin</option>
                <option value="pentester">Pentester</option>
                <option value="user">User</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Plan</label>
              <select
                className={styles.select}
                value={editForm.plan}
                onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Plan Expires At</label>
              <input
                className={styles.input}
                type="date"
                value={editForm.planExpiresAt}
                onChange={(e) => setEditForm({ ...editForm, planExpiresAt: e.target.value })}
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleSaveEdit}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className={styles.modalOverlay} onClick={() => setResetTarget(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Reset Password</h2>
            <p className={styles.pageSubtitle}>
              Set a new password for{" "}
              <strong>
                {resetTarget.name} ({resetTarget.email})
              </strong>
            </p>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>New Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="At least 8 characters"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Confirm Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="Re-enter new password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                }
              />
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setResetTarget(null)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleResetPassword}
                disabled={resetting}
              >
                {resetting ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className={styles.modalOverlay} onClick={() => setAddOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Add User</h2>
            <p className={styles.pageSubtitle}>
              Create a new user account. They will need to log in with the
              password you set here.
            </p>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Name</label>
              <input
                className={styles.input}
                type="text"
                placeholder="Jane Doe"
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="jane@example.com"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="At least 8 characters"
                value={addForm.password}
                onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Role</label>
              <select
                className={styles.select}
                value={addForm.role}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              >
                <option value="pentester">Pentester</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Plan</label>
              <select
                className={styles.select}
                value={addForm.plan}
                onChange={(e) => setAddForm({ ...addForm, plan: e.target.value })}
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="team">Team</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>

            <div className={styles.modalActions}>
              <button
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setAddOpen(false)}
                disabled={adding}
              >
                Cancel
              </button>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={handleAddUser}
                disabled={adding}
              >
                {adding ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;

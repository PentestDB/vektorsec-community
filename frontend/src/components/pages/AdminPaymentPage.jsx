"use client";

import { useEffect, useState } from "react";
import {
  getAllGateways,
  saveGateway,
  getAllOrders,
  markOrderPaid,
  confirmOrder,
} from "@/services/payment.service";
import {
  getAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from "@/services/plan.service";
import {
  SiGooglepay,
  SiAlipay,
  SiLine,
  SiPaypal,
  SiEthereum,
  SiBitcoin,
  SiBinance,
} from "react-icons/si";
import styles from "./AdminPaymentPage.module.scss";

const CHANNEL_LABELS = {
  googlepay: "Google Pay",
  alipay: "Alipay",
  linepay: "LINE Pay",
  paypal: "PayPal",
  crypto_eth: "Crypto (ETH)",
  crypto_btc: "Crypto (BTC)",
  crypto_bnb: "Crypto (BNB)",
};


const CHANNEL_BRAND_ICONS = {
  googlepay: SiGooglepay,
  alipay: SiAlipay,
  linepay: SiLine,
  paypal: SiPaypal,
  crypto_eth: SiEthereum,
  crypto_btc: SiBitcoin,
  crypto_bnb: SiBinance,
};



const AdminPaymentPage = () => {
  const [tab, setTab] = useState("gateways");
  const [gateways, setGateways] = useState([]);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editing state for a gateway.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  // Plan management state.
  const [plans, setPlans] = useState([]);
  const [planModal, setPlanModal] = useState(null); // null | "new" | planId
  const [planForm, setPlanForm] = useState({});

  const loadPlans = async () => {
    try {
      const data = await getAllPlans();
      setPlans(data.plans || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load plans");
    }
  };

  const loadGateways = async () => {
    try {
      const data = await getAllGateways();
      setGateways(data.gateways || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load gateways");
    }
  };

  const loadOrders = async (status) => {
    try {
      const data = await getAllOrders(status);
      setOrders(data.orders || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load orders");
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        if (tab === "gateways") {
          await loadGateways();
        } else if (tab === "plans") {
          await loadPlans();
        } else {
          await loadOrders(statusFilter);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, statusFilter]);

  const startEdit = (gw) => {
    setEditing(gw.channel);
    setForm({
      label: gw.label || "",
      enabled: gw.enabled,
      instructions: gw.instructions || "",
      merchantId: gw.merchantId || "",
      secret: gw.secret || "",
      logo: gw.logo || "",
      logoColor: gw.logoColor || "",
      cryptoWallet: {
        address: gw.cryptoWallet?.address || "",
        network: gw.cryptoWallet?.network || "",
        memo: gw.cryptoWallet?.memo || "",
      },
    });
  };

  const handleSave = async () => {
    setError("");
    setSuccess("");
    try {
      const body = {
        channel: editing,
        label: form.label,
        enabled: form.enabled,
        instructions: form.instructions,
        merchantId: form.merchantId,
        secret: form.secret || undefined,
        cryptoWallet: form.cryptoWallet,
        logo: form.logo || undefined,
        logoColor: form.logoColor || undefined,
      };
      await saveGateway(body);

      setSuccess("Gateway saved successfully");
      setEditing(null);
      await loadGateways();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save gateway");
    }
  };

  // Toggle a gateway on/off directly from the list (no need to open Edit).
  const handleToggleGateway = async (gw) => {
    setError("");
    setSuccess("");
    try {
      await saveGateway({
        channel: gw.channel,
        enabled: !gw.enabled,
      });
      setSuccess(
        `${gw.label || CHANNEL_LABELS[gw.channel]} ${
          gw.enabled ? "disabled" : "enabled"
        }`
      );

      await loadGateways();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update gateway");
    }
  };

  const handleMarkPaid = async (orderId) => {
    setError("");
    setSuccess("");
    try {
      await markOrderPaid(orderId, { confirm: true });
      setSuccess(`Order ${orderId} marked as paid and confirmed`);
      await loadOrders(statusFilter);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to mark order as paid");
    }
  };

  const handleConfirm = async (orderId) => {
    setError("");
    setSuccess("");
    try {
      await confirmOrder(orderId, {});
      setSuccess(`Order ${orderId} confirmed`);
      await loadOrders(statusFilter);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to confirm order");
    }
  };

  const defaultChannelPricing = () => ({
    telegram: { priceMonthly: 0, priceAnnual: 0, priceLifetime: 0, priceEnterprise: 0, enabled: false },
    online: { priceMonthly: 0, priceAnnual: 0, priceLifetime: 0, priceEnterprise: 0, enabled: false },
    platform: { priceMonthly: 0, priceAnnual: 0, priceLifetime: 0, priceEnterprise: 0, enabled: false },
  });

  const openPlanModal = (plan) => {
    if (plan) {
      setPlanModal(plan.planId);
      setPlanForm({
        planId: plan.planId,
        name: plan.name || "",
        description: plan.description || "",
        priceMonthly: plan.priceMonthly ?? 0,
        priceAnnual: plan.priceAnnual ?? 0,
        enabled: plan.enabled,
        sortOrder: plan.sortOrder ?? 0,
        features: (plan.features || []).join("\n"),
        channelPricing: {
          telegram: {
            priceMonthly: plan.channelPricing?.telegram?.priceMonthly ?? 0,
            priceAnnual: plan.channelPricing?.telegram?.priceAnnual ?? 0,
            priceLifetime: plan.channelPricing?.telegram?.priceLifetime ?? 0,
            priceEnterprise: plan.channelPricing?.telegram?.priceEnterprise ?? 0,
            enabled: plan.channelPricing?.telegram?.enabled ?? false,
          },
          online: {
            priceMonthly: plan.channelPricing?.online?.priceMonthly ?? 0,
            priceAnnual: plan.channelPricing?.online?.priceAnnual ?? 0,
            priceLifetime: plan.channelPricing?.online?.priceLifetime ?? 0,
            priceEnterprise: plan.channelPricing?.online?.priceEnterprise ?? 0,
            enabled: plan.channelPricing?.online?.enabled ?? false,
          },
          platform: {
            priceMonthly: plan.channelPricing?.platform?.priceMonthly ?? 0,
            priceAnnual: plan.channelPricing?.platform?.priceAnnual ?? 0,
            priceLifetime: plan.channelPricing?.platform?.priceLifetime ?? 0,
            priceEnterprise: plan.channelPricing?.platform?.priceEnterprise ?? 0,
            enabled: plan.channelPricing?.platform?.enabled ?? false,
          },
        },
        limits: {
          maxConcurrentSessions: plan.limits?.maxConcurrentSessions ?? 1,
          maxSessionsPerPeriod: plan.limits?.maxSessionsPerPeriod ?? 10,
          maxAgentIterations: plan.limits?.maxAgentIterations ?? 25,
          maxWorkspaces: plan.limits?.maxWorkspaces ?? 1,
          maxMcpTokens: plan.limits?.maxMcpTokens ?? 2,
          advancedTools: plan.limits?.advancedTools ?? false,
          swarmEnabled: plan.limits?.swarmEnabled ?? false,
          prioritySupport: plan.limits?.prioritySupport ?? false,
          auditLogRetention: plan.limits?.auditLogRetention ?? false,
          maxTeamMembers: plan.limits?.maxTeamMembers ?? 1,
          maxTokensPerDay: plan.limits?.maxTokensPerDay ?? 0,
          maxRequestsPerDay: plan.limits?.maxRequestsPerDay ?? 0,
        },
      });
    } else {
      setPlanModal("new");
      setPlanForm({
        planId: "",
        name: "",
        description: "",
        priceMonthly: 0,
        priceAnnual: 0,
        enabled: true,
        sortOrder: 0,
        features: "",
        channelPricing: defaultChannelPricing(),
        limits: {
          maxConcurrentSessions: 1,
          maxSessionsPerPeriod: 10,
          maxAgentIterations: 25,
          maxWorkspaces: 1,
          maxMcpTokens: 2,
          advancedTools: false,
          swarmEnabled: false,
          prioritySupport: false,
          auditLogRetention: false,
          maxTeamMembers: 1,
          maxTokensPerDay: 0,
          maxRequestsPerDay: 0,
        },
      });
    }
  };


  const handleSavePlan = async () => {
    setError("");
    setSuccess("");
    try {
      const body = {
        name: planForm.name,
        description: planForm.description,
        priceMonthly: Number(planForm.priceMonthly) || 0,
        priceAnnual: Number(planForm.priceAnnual) || 0,
        enabled: planForm.enabled,
        sortOrder: Number(planForm.sortOrder) || 0,
        features: (planForm.features || "")
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        limits: planForm.limits,
        channelPricing: planForm.channelPricing,
      };


      if (planModal === "new") {
        body.planId = planForm.planId.trim().toLowerCase();
        if (!body.planId) {
          setError("Plan ID is required");
          return;
        }
        await createPlan(body);
        setSuccess(`Plan "${body.planId}" created`);
      } else {
        await updatePlan(planModal, body);
        setSuccess(`Plan "${planModal}" updated`);
      }
      setPlanModal(null);
      await loadPlans();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save plan");
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!window.confirm(`Delete plan "${planId}"? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    try {
      await deletePlan(planId);
      setSuccess(`Plan "${planId}" deleted`);
      await loadPlans();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to delete plan");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading admin panel...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Payment Admin</h1>
        <p className={styles.subtitle}>
          Manage payment gateways and verify customer orders.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "gateways" ? styles.tabActive : ""}`}
          onClick={() => setTab("gateways")}
        >
          Payment Gateways
        </button>
        <button
          className={`${styles.tab} ${tab === "orders" ? styles.tabActive : ""}`}
          onClick={() => setTab("orders")}
        >
          Orders
        </button>
        <button
          className={`${styles.tab} ${tab === "plans" ? styles.tabActive : ""}`}
          onClick={() => setTab("plans")}
        >
          Plans
        </button>
      </div>

      {tab === "gateways" && (
        <div className={styles.gatewayList}>
          {gateways.map((gw) => (
            <div key={gw.channel} className={styles.gatewayCard}>
              <div className={styles.gatewayHeader}>
                <div className={styles.gatewayTitleWrap}>
                  {gw.logo ? (
                    <img
                      src={gw.logo}
                      alt={gw.label || CHANNEL_LABELS[gw.channel]}
                      className={styles.gatewayLogo}
                    />
                  ) : CHANNEL_BRAND_ICONS[gw.channel] ? (
                    (() => {
                      const BrandIcon = CHANNEL_BRAND_ICONS[gw.channel];
                      return (
                        <span
                          className={styles.gatewayLogoFallback}
                          style={{
                            background: gw.logoColor || "#0d1117",
                            color: gw.logoColor ? "#fff" : "#8b949e",
                          }}
                        >
                          <BrandIcon className={styles.gatewayBrandIcon} />
                        </span>
                      );
                    })()
                  ) : (
                    <span
                      className={styles.gatewayLogoFallback}
                      style={{
                        background: gw.logoColor || "#30363d",
                        color: gw.logoColor ? "#fff" : "#8b949e",
                      }}
                    >
                      {(gw.label || CHANNEL_LABELS[gw.channel]).charAt(0).toUpperCase()}
                    </span>
                  )}

                  <div>
                    <h3 className={styles.gatewayName}>
                      {gw.label || CHANNEL_LABELS[gw.channel]}
                    </h3>

                    <span className={styles.gatewayChannel}>{gw.channel}</span>
                  </div>

                </div>
                <div className={styles.gatewayActions}>

                  <label className={styles.toggleWrap}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={!!gw.enabled}
                      onChange={() => handleToggleGateway(gw)}
                    />
                    <span
                      className={`${styles.toggle} ${
                        gw.enabled ? styles.toggleOn : ""
                      }`}
                    >
                      <span className={styles.toggleKnob} />
                    </span>
                    <span className={styles.toggleLabel}>
                      {gw.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                  <button
                    className={styles.editBtn}
                    onClick={() => startEdit(gw)}
                  >
                    Edit
                  </button>
                </div>
              </div>

              {gw.channel.startsWith("crypto_") && gw.cryptoWallet?.address && (
                <div className={styles.gatewayDetail}>
                  <span className={styles.detailLabel}>Wallet:</span>
                  <span className={styles.detailValue}>{gw.cryptoWallet.address}</span>
                </div>
              )}
              {gw.merchantId && (
                <div className={styles.gatewayDetail}>
                  <span className={styles.detailLabel}>Merchant:</span>
                  <span className={styles.detailValue}>{gw.merchantId}</span>
                </div>
              )}
              {gw.instructions && (
                <div className={styles.gatewayDetail}>
                  <span className={styles.detailLabel}>Instructions:</span>
                  <span className={styles.detailValue}>{gw.instructions}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div className={styles.ordersSection}>
          <div className={styles.filterRow}>
            <select
              className={styles.filter}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="confirmed">Confirmed</option>
              <option value="expired">Expired</option>
              <option value="canceled">Canceled</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>

          {orders.length === 0 ? (
            <div className={styles.empty}>No orders found.</div>
          ) : (
            <div className={styles.orderTable}>
              <div className={styles.orderHeader}>
                <span>Order</span>
                <span>User</span>
                <span>Plan</span>
                <span>Amount</span>
                <span>Channel</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {orders.map((o) => (
                <div key={o.orderId} className={styles.orderRow}>
                  <span className={styles.mono}>{o.orderId}</span>
                  <span className={styles.mono}>{o.userId}</span>
                  <span>{o.plan}</span>
                  <span>${o.amountUsd}</span>
                  <span>{CHANNEL_LABELS[o.channel] || o.channel}</span>


                  <span className={`${styles.status} ${styles[`status_${o.status}`]}`}>
                    {o.status}
                  </span>
                  <span className={styles.orderActions}>
                    {o.status === "pending" && (
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleMarkPaid(o.orderId)}
                      >
                        Mark Paid
                      </button>
                    )}
                    {o.status === "paid" && (
                      <button
                        className={styles.actionBtn}
                        onClick={() => handleConfirm(o.orderId)}
                      >
                        Confirm
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "plans" && (
        <div className={styles.plansSection}>
          <div className={styles.plansHeader}>
            <h2 className={styles.sectionTitle}>Plans</h2>
            <button
              className={styles.addBtn}
              onClick={() => openPlanModal(null)}
            >
              + New Plan
            </button>
          </div>

          {plans.length === 0 ? (
            <div className={styles.empty}>No plans found.</div>
          ) : (
            <div className={styles.planTable}>
              <div className={styles.planHeader}>
                <span>Plan</span>
                <span>Price</span>
                <span>Limits</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {plans.map((p) => (
                <div key={p.planId} className={styles.planRow}>
                  <span>
                    <strong>{p.name}</strong>
                    <span className={styles.planId}>{p.planId}</span>
                  </span>
                  <span>
                    ${p.priceMonthly}/mo · ${p.priceAnnual}/yr
                  </span>
                  <span className={styles.planLimits}>
                    {p.limits?.maxConcurrentSessions} concurrent ·{" "}
                    {p.limits?.maxWorkspaces} workspaces ·{" "}
                    {p.limits?.maxMcpTokens} MCP
                  </span>
                  <span
                    className={`${styles.badge} ${
                      p.enabled ? styles.badgeOn : styles.badgeOff
                    }`}
                  >
                    {p.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <span className={styles.planActions}>
                    <button
                      className={styles.editBtn}
                      onClick={() => openPlanModal(p)}
                    >
                      Edit
                    </button>
                    {p.planId !== "free" && (
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeletePlan(p.planId)}
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Plan edit/create modal */}
      {planModal && (
        <div className={styles.modalOverlay} onClick={() => setPlanModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {planModal === "new" ? "New Plan" : `Edit ${planModal}`}
            </h2>

            {planModal === "new" && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Plan ID</span>
                <input
                  className={styles.input}
                  value={planForm.planId || ""}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, planId: e.target.value })
                  }
                  placeholder="e.g. pro, team, enterprise"
                />
              </label>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <input
                className={styles.input}
                value={planForm.name || ""}
                onChange={(e) =>
                  setPlanForm({ ...planForm, name: e.target.value })
                }
                placeholder="Plan display name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Description</span>
              <textarea
                className={styles.textarea}
                value={planForm.description || ""}
                onChange={(e) =>
                  setPlanForm({ ...planForm, description: e.target.value })
                }
                placeholder="Short description"
                rows={2}
              />
            </label>

            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Price / month ($)</span>
                <input
                  className={styles.input}
                  type="number"
                  value={planForm.priceMonthly ?? 0}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      priceMonthly: e.target.value,
                    })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Price / year ($)</span>
                <input
                  className={styles.input}
                  type="number"
                  value={planForm.priceAnnual ?? 0}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      priceAnnual: e.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Sort order</span>
                <input
                  className={styles.input}
                  type="number"
                  value={planForm.sortOrder ?? 0}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, sortOrder: e.target.value })
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Enabled</span>
                <input
                  type="checkbox"
                  checked={!!planForm.enabled}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, enabled: e.target.checked })
                  }
                />
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Features (one per line)</span>
              <textarea
                className={styles.textarea}
                value={planForm.features || ""}
                onChange={(e) =>
                  setPlanForm({ ...planForm, features: e.target.value })
                }
                placeholder={"1 concurrent session\n10 sessions / month"}
                rows={4}
              />
            </label>

            <div className={styles.limitsSection}>
              <h3 className={styles.limitsTitle}>Limits</h3>
              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Concurrent sessions</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxConcurrentSessions ?? 1}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxConcurrentSessions: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Sessions / period</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxSessionsPerPeriod ?? 10}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxSessionsPerPeriod: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Agent iterations</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxAgentIterations ?? 25}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxAgentIterations: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Workspaces</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxWorkspaces ?? 1}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxWorkspaces: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>MCP tokens</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxMcpTokens ?? 2}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxMcpTokens: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Team members</span>
                  <input
                    className={styles.input}
                    type="number"
                    value={planForm.limits?.maxTeamMembers ?? 1}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxTeamMembers: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.formRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Max tokens / day (0 = unlimited)
                  </span>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    value={planForm.limits?.maxTokensPerDay ?? 0}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxTokensPerDay: e.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>
                    Max requests / day (0 = unlimited)
                  </span>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    value={planForm.limits?.maxRequestsPerDay ?? 0}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          maxRequestsPerDay: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </div>
              <div className={styles.checkboxRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={!!planForm.limits?.advancedTools}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          advancedTools: e.target.checked,
                        },
                      })
                    }
                  />
                  Advanced tools
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={!!planForm.limits?.swarmEnabled}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          swarmEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Swarm
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={!!planForm.limits?.prioritySupport}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          prioritySupport: e.target.checked,
                        },
                      })
                    }
                  />
                  Priority support
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={!!planForm.limits?.auditLogRetention}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        limits: {
                          ...planForm.limits,
                          auditLogRetention: e.target.checked,
                        },
                      })
                    }
                  />
                  Audit log retention
                </label>
              </div>
            </div>

            <div className={styles.channelPricingSection}>
              <h3 className={styles.limitsTitle}>Channel Pricing</h3>
              <p className={styles.channelPricingHint}>
                Set per-channel prices. Leave disabled to fall back to the base
                price above. Channels: Telegram, Online, Platform.
              </p>
              {["telegram", "online", "platform"].map((ch) => (
                <div key={ch} className={styles.channelPricingCard}>
                  <div className={styles.channelPricingHeader}>
                    <span className={styles.channelPricingName}>
                      {ch.charAt(0).toUpperCase() + ch.slice(1)}
                    </span>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={!!planForm.channelPricing?.[ch]?.enabled}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            channelPricing: {
                              ...planForm.channelPricing,
                              [ch]: {
                                ...planForm.channelPricing?.[ch],
                                enabled: e.target.checked,
                              },
                            },
                          })
                        }
                      />
                      Enabled
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Monthly ($)</span>
                      <input
                        className={styles.input}
                        type="number"
                        value={planForm.channelPricing?.[ch]?.priceMonthly ?? 0}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            channelPricing: {
                              ...planForm.channelPricing,
                              [ch]: {
                                ...planForm.channelPricing?.[ch],
                                priceMonthly: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Annual ($)</span>
                      <input
                        className={styles.input}
                        type="number"
                        value={planForm.channelPricing?.[ch]?.priceAnnual ?? 0}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            channelPricing: {
                              ...planForm.channelPricing,
                              [ch]: {
                                ...planForm.channelPricing?.[ch],
                                priceAnnual: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Lifetime ($)</span>
                      <input
                        className={styles.input}
                        type="number"
                        value={planForm.channelPricing?.[ch]?.priceLifetime ?? 0}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            channelPricing: {
                              ...planForm.channelPricing,
                              [ch]: {
                                ...planForm.channelPricing?.[ch],
                                priceLifetime: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Enterprise ($)</span>
                      <input
                        className={styles.input}
                        type="number"
                        value={planForm.channelPricing?.[ch]?.priceEnterprise ?? 0}
                        onChange={(e) =>
                          setPlanForm({
                            ...planForm,
                            channelPricing: {
                              ...planForm.channelPricing,
                              [ch]: {
                                ...planForm.channelPricing?.[ch],
                                priceEnterprise: e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setPlanModal(null)}
              >
                Cancel
              </button>
              <button className={styles.saveBtn} onClick={handleSavePlan}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit gateway modal */}

      {editing && (
        <div className={styles.modalOverlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              Edit {CHANNEL_LABELS[editing] || editing}
            </h2>


            <label className={styles.field}>
              <span className={styles.fieldLabel}>Label</span>
              <input
                className={styles.input}
                value={form.label || ""}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Display name"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Enabled</span>
              <input
                type="checkbox"
                checked={!!form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
            </label>

            {editing.startsWith("crypto_") ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Wallet Address</span>
                  <input
                    className={styles.input}
                    value={form.cryptoWallet?.address || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cryptoWallet: {
                          ...form.cryptoWallet,
                          address: e.target.value,
                        },
                      })
                    }
                    placeholder="0x... / bc1... / bnb..."
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Network</span>
                  <input
                    className={styles.input}
                    value={form.cryptoWallet?.network || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cryptoWallet: {
                          ...form.cryptoWallet,
                          network: e.target.value,
                        },
                      })
                    }
                    placeholder="Ethereum / Bitcoin / BNB Smart Chain"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Memo (optional)</span>
                  <input
                    className={styles.input}
                    value={form.cryptoWallet?.memo || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cryptoWallet: {
                          ...form.cryptoWallet,
                          memo: e.target.value,
                        },
                      })
                    }
                    placeholder="Memo / tag"
                  />
                </label>
              </>
            ) : (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Merchant ID</span>
                  <input
                    className={styles.input}
                    value={form.merchantId || ""}
                    onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
                    placeholder="Merchant / App ID"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Secret / Key</span>
                  <input
                    className={styles.input}
                    type="password"
                    value={form.secret || ""}
                    onChange={(e) => setForm({ ...form, secret: e.target.value })}
                    placeholder="Leave blank to keep existing"
                  />
                </label>
              </>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Logo URL (favicon / image)</span>
              <input
                className={styles.input}
                value={form.logo || ""}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://.../logo.png"
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Logo Color (hex, fallback when no image)</span>
              <input
                className={styles.input}
                value={form.logoColor || ""}
                onChange={(e) => setForm({ ...form, logoColor: e.target.value })}
                placeholder="#4285F4"
              />
            </label>

            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditing(null)}>
                Cancel
              </button>

              <button className={styles.saveBtn} onClick={handleSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPaymentPage;

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPlan,
  getMyBilling,
  getUsage,
  redeemCoupon,
  resumePlan,
  upgradePlan,
} from "@/services/billing.service";
import styles from "./BillingPage.module.scss";

const BillingPage = () => {
  const router = useRouter();
  const [billing, setBilling] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      const [billingData, usageData] = await Promise.all([
        getMyBilling(),
        getUsage(),
      ]);
      setBilling(billingData);
      setUsage(usageData);
    } catch (err) {
      setError("Failed to load billing information");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUpgrade = async (plan) => {
    setActionLoading(true);
    setError("");
    try {
      await upgradePlan({ plan, interval: "monthly" });
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to upgrade plan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    setError("");
    try {
      await cancelPlan();
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to cancel plan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    setError("");
    try {
      await resumePlan();
      await loadData();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to resume plan");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedeemCoupon = async () => {
    setCouponMsg("");
    setCouponError("");
    if (!coupon.trim()) {
      setCouponError("Please enter a coupon code");
      return;
    }
    setActionLoading(true);
    try {
      const result = await redeemCoupon(coupon.trim());
      setCouponMsg(result?.message || "Coupon redeemed!");
      setCoupon("");
      await loadData();
    } catch (err) {
      setCouponError(err?.response?.data?.message || "Failed to redeem coupon");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading billing...</div>;
  }

  if (error && !billing) {
    return <div className={styles.error}>{error}</div>;
  }

  const planName = billing?.planName || "Free";
  const isPaid = billing?.plan !== "free";
  const cancelAtPeriodEnd = billing?.cancelAtPeriodEnd;

  const usageBars = usage?.usage
    ? [
        {
          label: "Concurrent Sessions",
          current: usage.usage.concurrentSessions.current,
          limit: usage.usage.concurrentSessions.limit,
        },
        {
          label: "Sessions / Period",
          current: usage.usage.sessionsPerPeriod.current,
          limit: usage.usage.sessionsPerPeriod.limit,
        },
        {
          label: "Workspaces",
          current: usage.usage.workspaces.current,
          limit: usage.usage.workspaces.limit,
        },
        {
          label: "MCP Tokens",
          current: usage.usage.mcpTokens.current,
          limit: usage.usage.mcpTokens.limit,
        },
      ]
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Billing & Subscription</h1>
        <p className={styles.subtitle}>Manage your plan and usage</p>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Current plan card */}
      <div className={styles.planCard}>
        <div className={styles.planInfo}>
          <h2 className={styles.planName}>{planName} Plan</h2>
          <p className={styles.planPrice}>
            {billing?.planPriceMonthly > 0 ? (
              <>
                ${billing.planPriceMonthly}
                <span className={styles.perMonth}>/month</span>
              </>
            ) : (
              "Free forever"
            )}
          </p>
          {cancelAtPeriodEnd && (
            <div className={styles.cancelNotice}>
              Your subscription will be canceled at the end of the billing period.
            </div>
          )}
          {billing?.planExpiresAt && (
            <div className={styles.expiry}>
              Plan expires: {new Date(billing.planExpiresAt).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className={styles.planActions}>
          {!isPaid && (
            <button
              className={styles.upgradeBtn}
              onClick={() => router.push("/pricing")}
            >
              Upgrade Plan
            </button>
          )}
          {isPaid && !cancelAtPeriodEnd && (
            <button
              className={styles.cancelBtn}
              onClick={handleCancel}
              disabled={actionLoading}
            >
              Cancel Subscription
            </button>
          )}
          {isPaid && cancelAtPeriodEnd && (
            <button
              className={styles.resumeBtn}
              onClick={handleResume}
              disabled={actionLoading}
            >
              Resume Subscription
            </button>
          )}
        </div>
      </div>

      {/* Plan features */}
      <div className={styles.featuresCard}>
        <h3 className={styles.sectionTitle}>Included Features</h3>
        <ul className={styles.features}>
          {(billing?.planFeatures || []).map((feature, i) => (
            <li key={i} className={styles.feature}>
              <span className={styles.check}>✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Usage */}
      <div className={styles.usageCard}>
        <h3 className={styles.sectionTitle}>Usage</h3>
        <div className={styles.usageGrid}>
          {usageBars.map((item) => {
            const pct =
              item.limit > 0
                ? Math.min(100, Math.round((item.current / item.limit) * 100))
                : 0;
            return (
              <div key={item.label} className={styles.usageItem}>
                <div className={styles.usageLabel}>
                  <span>{item.label}</span>
                  <span className={styles.usageValue}>
                    {item.current}
                    {item.limit > 0 ? ` / ${item.limit}` : " / ∞"}
                  </span>
                </div>
                <div className={styles.progressTrack}>
                  <div
                    className={`${styles.progressFill} ${
                      pct >= 90 ? styles.danger : ""
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {usage?.usage?.credits && (
          <div className={styles.credits}>
            <strong>Credits:</strong> {usage.usage.credits.current} available
            {usage.usage.credits.used > 0 && ` (${usage.usage.credits.used} used)`}
          </div>
        )}
      </div>

      {/* Coupon redemption */}
      <div className={styles.couponCard}>
        <h3 className={styles.sectionTitle}>Redeem Coupon</h3>
        <div className={styles.couponRow}>
          <input
            className={styles.couponInput}
            placeholder="Enter coupon code"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
          />
          <button
            className={styles.redeemBtn}
            onClick={handleRedeemCoupon}
            disabled={actionLoading}
          >
            Redeem
          </button>
        </div>
        {couponMsg && <div className={styles.couponSuccess}>{couponMsg}</div>}
        {couponError && <div className={styles.couponError}>{couponError}</div>}
      </div>
    </div>
  );
};

export default BillingPage;

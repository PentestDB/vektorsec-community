"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dropdown } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import {
  cancelPlan,
  getMyBilling,
  getUsage,
  redeemCoupon,
  resumePlan,
  upgradePlan,
} from "@/services/billing.service";
import { usageExportUrl } from "@/services/subscription.service";
import styles from "./BillingPage.module.scss";
import { useTranslation } from "@/i18n/I18nProvider";

const BillingPage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const [billing, setBilling] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");
  const [couponError, setCouponError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  /** Channels a usage CSV can be exported for (see Subscription.model.ts). */
  const usageExportChannels = [
    { key: "online", label: t("billing.exportChannelOnline") },
    { key: "telegram", label: t("billing.exportChannelTelegram") },
    { key: "platform", label: t("billing.exportChannelPlatform") },
  ];

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
      setError(err?.response?.data?.message || t("billing.upgradeFailed"));
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
      setError(err?.response?.data?.message || t("billing.cancelFailed"));
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
      setCouponError(t("billing.enterCoupon"));
      return;
    }
    setActionLoading(true);
    try {
      const result = await redeemCoupon(coupon.trim());
      setCouponMsg(result?.message || t("billing.couponRedeemed"));
      setCoupon("");
      await loadData();
    } catch (err) {
      setCouponError(err?.response?.data?.message || t("billing.redeemFailed"));
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

  const planName = billing?.planName || t("billing.free");
  const isPaid = billing?.plan !== "free";
  const cancelAtPeriodEnd = billing?.cancelAtPeriodEnd;

  const usageBars = usage?.usage
    ? [
        {
          label: t("billing.concurrentSessions"),
          current: usage.usage.concurrentSessions.current,
          limit: usage.usage.concurrentSessions.limit,
        },
        {
          label: t("billing.sessionsPerPeriod"),
          current: usage.usage.sessionsPerPeriod.current,
          limit: usage.usage.sessionsPerPeriod.limit,
        },
        {
          label: t("billing.workspaces"),
          current: usage.usage.workspaces.current,
          limit: usage.usage.workspaces.limit,
        },
        {
          label: t("billing.mcpTokens"),
          current: usage.usage.mcpTokens.current,
          limit: usage.usage.mcpTokens.limit,
        },
      ]
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("billing.title")}</h1>
        <p className={styles.subtitle}>{t("billing.subtitle")}</p>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Current plan card */}
      <div className={styles.planCard}>
        <div className={styles.planInfo}>
          <h2 className={styles.planName}>
            {t("billing.planTitle", { plan: planName })}
          </h2>
          <p className={styles.planPrice}>
            {billing?.planPriceMonthly > 0 ? (
              <>
                ${billing.planPriceMonthly}
                <span className={styles.perMonth}>{t("billing.perMonth")}</span>
              </>
            ) : (
              t("billing.freeForever")
            )}
          </p>
          {cancelAtPeriodEnd && (
            <div className={styles.cancelNotice}>{t("billing.cancelNotice")}</div>
          )}
          {billing?.planExpiresAt && (
            <div className={styles.expiry}>
              {t("billing.planExpires", {
                date: new Date(billing.planExpiresAt).toLocaleDateString(),
              })}
            </div>
          )}
        </div>

        <div className={styles.planActions}>
          {!isPaid && (
            <button
              className={styles.upgradeBtn}
              onClick={() => router.push("/pricing")}
            >
              {t("billing.upgradePlan")}
            </button>
          )}
          {isPaid && !cancelAtPeriodEnd && (
            <button
              className={styles.cancelBtn}
              onClick={handleCancel}
              disabled={actionLoading}
            >
              {t("billing.cancelSubscription")}
            </button>
          )}
          {isPaid && cancelAtPeriodEnd && (
            <button
              className={styles.resumeBtn}
              onClick={handleResume}
              disabled={actionLoading}
            >
              {t("billing.resumeSubscription")}
            </button>
          )}
        </div>
      </div>

      {/* Plan features */}
      <div className={styles.featuresCard}>
        <h3 className={styles.sectionTitle}>{t("billing.includedFeatures")}</h3>
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
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>{t("billing.usage")}</h3>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: usageExportChannels,
              onClick: ({ key }) => {
                // Same-origin download: the gateway relays Content-Disposition.
                window.location.assign(usageExportUrl(key, 30));
              },
            }}
          >
            <Button size="small" icon={<DownloadOutlined />}>
              {t("common.exportUsage")}
            </Button>
          </Dropdown>
        </div>
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
            <strong>{t("billing.credits")}</strong>{" "}
            {t("billing.creditsAvailable", {
              count: usage.usage.credits.current,
            })}
            {usage.usage.credits.used > 0 &&
              ` ${t("billing.creditsUsed", { count: usage.usage.credits.used })}`}
          </div>
        )}
      </div>

      {/* Coupon redemption */}
      <div className={styles.couponCard}>
        <h3 className={styles.sectionTitle}>{t("billing.redeemCoupon")}</h3>
        <div className={styles.couponRow}>
          <input
            className={styles.couponInput}
            placeholder={t("billing.couponPlaceholder")}
            value={coupon}
            onChange={(e) => setCoupon(e.target.value)}
          />
          <button
            className={styles.redeemBtn}
            onClick={handleRedeemCoupon}
            disabled={actionLoading}
          >
            {t("billing.redeem")}
          </button>
        </div>
        {couponMsg && <div className={styles.couponSuccess}>{couponMsg}</div>}
        {couponError && <div className={styles.couponError}>{couponError}</div>}
      </div>
    </div>
  );
};

export default BillingPage;

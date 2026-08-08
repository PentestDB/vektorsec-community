"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getTopUpPackages,
  getEnabledGateways,
  createTopUpOrder,
  getMyCredits,
} from "@/services/payment.service";
import styles from "./TopUpPage.module.scss";

const TopUpPage = () => {
  const [packages, setPackages] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [balance, setBalance] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [order, setOrder] = useState(null); // created order + instructions

  const load = useCallback(async () => {
    setError("");
    try {
      const [packagesData, gatewaysData, creditsData] = await Promise.all([
        getTopUpPackages(),
        getEnabledGateways(),
        getMyCredits().catch(() => null),
      ]);
      setPackages(packagesData.packages || []);
      setGateways(gatewaysData.gateways || []);
      setBalance(creditsData?.balance || null);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load top-up options");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePlaceOrder = async () => {
    if (!selectedPackage) {
      setError("Select a top-up package first.");
      return;
    }
    if (!selectedChannel) {
      setError("Select a payment method.");
      return;
    }
    setError("");
    setSuccess("");
    setPlacing(true);
    setOrder(null);
    try {
      const data = await createTopUpOrder({
        packageId: selectedPackage.packageId,
        channel: selectedChannel,
      });
      setOrder(data);
      setSuccess("Order created. Complete the payment below.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create top-up order");
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading top-up options...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Top-up Tokens</h1>
        <p className={styles.subtitle}>
          Add tokens to your account. Tokens are used to run pentest scans and agent tasks.
        </p>
      </div>

      {balance && (
        <div className={styles.balanceCard}>
          <span className={styles.balanceLabel}>Your Balance</span>
          <span className={styles.balanceValue}>
            {balance.credits.toLocaleString()} tokens
          </span>
          {balance.creditsUsed > 0 && (
            <span className={styles.balanceUsed}>{balance.creditsUsed.toLocaleString()} used</span>
          )}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Step 1: choose package */}
      <h2 className={styles.sectionTitle}>1. Choose Package</h2>
      {packages.length === 0 ? (
        <div className={styles.empty}>No top-up packages are currently available.</div>
      ) : (
        <div className={styles.packagesGrid}>
          {packages.map((pkg) => (
            <button
              key={pkg.packageId}
              className={`${styles.packageCard} ${
                selectedPackage?.packageId === pkg.packageId ? styles.packageActive : ""
              }`}
              onClick={() => setSelectedPackage(pkg)}
            >
              <div className={styles.packagePrice}>${pkg.priceUsd}</div>
              <div className={styles.packageTokens}>{pkg.tokens.toLocaleString()} tokens</div>
              {pkg.description && <div className={styles.packageDesc}>{pkg.description}</div>}
            </button>
          ))}
        </div>
      )}

      {/* Pricing adjustment policy */}
      <div className={styles.pricingNotice}>
        <div className={styles.pricingNoticeHeader}>
          <span className={styles.pricingNoticeBadge}>Dynamic Pricing</span>
          <span className={styles.pricingNoticeTitle}>How Our Pricing Works</span>
        </div>
        <p className={styles.pricingNoticeText}>
          Token prices may be adjusted by time period to reflect demand, peak
          hours and ongoing promotions. The price shown on each package is the
          current live rate, so the amount you pay is always locked in at
          checkout. Any future price change never affects tokens you have already
          purchased, and no extra fees are ever applied after payment.
        </p>
      </div>

      {/* Step 2: choose channel */}
      <h2 className={styles.sectionTitle}>2. Payment Method</h2>
      {gateways.length === 0 ? (
        <div className={styles.empty}>No payment methods are currently available.</div>
      ) : (
        <div className={styles.channelList}>
          {gateways.map((gw) => (
            <button
              key={gw.channel}
              className={`${styles.channelBtn} ${
                selectedChannel === gw.channel ? styles.channelActive : ""
              }`}
              onClick={() => setSelectedChannel(gw.channel)}
            >
              {gw.label}
            </button>
          ))}
        </div>
      )}


      {/* Step 3: place order */}
      <div className={styles.orderRow}>
        <button className={styles.placeBtn} onClick={handlePlaceOrder} disabled={placing}>
          {placing ? "Creating order..." : "Create Top-up Order"}
        </button>
      </div>

      {/* Order instructions */}
      {order && (
        <div className={styles.orderCard}>
          <h2 className={styles.cardTitle}>Payment Instructions</h2>
          <div className={styles.orderRowDetail}>
            <span className={styles.detailKey}>Order ID</span>
            <span className={styles.detailValue}>{order.order?.orderId}</span>
          </div>
          <div className={styles.orderRowDetail}>
            <span className={styles.detailKey}>Amount</span>
            <span className={styles.detailValue}>${order.order?.amountUsd} USD</span>
          </div>
          <div className={styles.orderRowDetail}>
            <span className={styles.detailKey}>Tokens</span>
            <span className={styles.detailValue}>
              {order.instructions?.topupTokens?.toLocaleString()}
            </span>
          </div>
          {order.instructions?.cryptoWallet?.address && (
            <div className={styles.orderRowDetail}>
              <span className={styles.detailKey}>Wallet</span>
              <span className={`${styles.detailValue} ${styles.mono}`}>
                {order.instructions.cryptoWallet.address}
              </span>
            </div>
          )}
          {order.instructions?.instructions && (
            <p className={styles.instructions}>{order.instructions.instructions}</p>
          )}
          <p className={styles.pendingNote}>
            Your tokens will be credited after an admin confirms the payment.
          </p>
        </div>
      )}
    </div>
  );
};

export default TopUpPage;


"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getEnabledGateways,
  createPaymentOrder,
  getMyOrders,
  cancelOrder,
} from "@/services/payment.service";
import { getPlans } from "@/services/billing.service";
import {
  SiGooglepay,
  SiAlipay,
  SiLine,
  SiPaypal,
  SiEthereum,
  SiBitcoin,
  SiBinance,
} from "react-icons/si";
import styles from "./CheckoutPage.module.scss";

// Single source of truth: gateway channel display icons (plain text letters —
// emoji are avoided to prevent UTF-16 surrogate issues when copy/pasting code).
const CHANNEL_ICONS = {
  googlepay: "G",
  alipay: "A",
  linepay: "L",
  paypal: "P",
  crypto_eth: "Ξ",
  crypto_btc: "₿",
  crypto_bnb: "B",
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



const SUB_CHANNELS = [
  { id: "platform", label: "Web Platform", desc: "Access via the web dashboard" },
  { id: "telegram", label: "Telegram Bot", desc: "Access via the Telegram bot" },
  { id: "online", label: "Online API", desc: "Access via the online API" },
];


const CheckoutPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan") || "pro";
  const interval = searchParams.get("interval") || "monthly";

  const [plans, setPlans] = useState([]);
  const [gateways, setGateways] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [selectedSubChannel, setSelectedSubChannel] = useState("platform");
  const [order, setOrder] = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");


  const plan = plans.find((p) => p.id === planId);
  const price = interval === "annual" ? plan?.priceAnnual : plan?.priceMonthly;

  useEffect(() => {
    const load = async () => {
      try {
        const [plansData, gatewaysData, ordersData] = await Promise.all([
          getPlans(),
          getEnabledGateways(),
          getMyOrders().catch(() => ({ orders: [] })),
        ]);
        setPlans(plansData.plans || []);
        setGateways(gatewaysData.gateways || []);
        setMyOrders(ordersData.orders || []);
        if (gatewaysData.gateways?.length) {
          setSelectedChannel(gatewaysData.gateways[0].channel);
        }
      } catch (err) {
        setError("Failed to load checkout data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreateOrder = async () => {
    if (!selectedChannel) {
      setError("Please select a payment method");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const data = await createPaymentOrder({
        plan: planId,
        interval,
        channel: selectedChannel,
        subscriptionChannel: selectedSubChannel,
      });

      setOrder(data.order);
      setInstructions(data.instructions);
      // Refresh my orders.
      const ordersData = await getMyOrders();
      setMyOrders(ordersData.orders || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      await cancelOrder(orderId);
      const ordersData = await getMyOrders();
      setMyOrders(ordersData.orders || []);
      if (order?.orderId === orderId) {
        setOrder(null);
        setInstructions(null);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to cancel order");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading checkout...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Checkout</h1>
        <p className={styles.subtitle}>
          Complete your purchase to activate your {plan?.name || planId} plan.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.grid}>
        {/* Order summary */}
        <div className={styles.summary}>
          <h2 className={styles.sectionTitle}>Order Summary</h2>
          <div className={styles.summaryRow}>
            <span>Plan</span>
            <span className={styles.summaryValue}>{plan?.name || planId}</span>
          </div>
          <div className={styles.summaryRow}>
            <span>Billing</span>
            <span className={styles.summaryValue}>
              {interval === "annual" ? "Annual" : "Monthly"}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span>Price</span>
            <span className={styles.summaryValue}>${price ?? "—"}/mo</span>
          </div>
          {interval === "annual" && plan?.priceAnnual > 0 && (
            <div className={styles.summaryRow}>
              <span>Billed annually</span>
              <span className={styles.summaryValue}>
                ${(plan.priceAnnual * 12).toFixed(0)}/yr
              </span>
            </div>
          )}
          <div className={styles.summaryDivider} />
          <div className={styles.summaryRow}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.totalValue}>
              ${interval === "annual" ? (plan?.priceAnnual ?? 0) * 12 : price ?? 0}
            </span>
          </div>
        </div>

        {/* Payment method */}
        <div className={styles.payment}>
          <h2 className={styles.sectionTitle}>Access Channel</h2>
          <div className={styles.subChannelList}>
            {SUB_CHANNELS.map((sc) => (
              <button
                key={sc.id}
                className={`${styles.subChannel} ${
                  selectedSubChannel === sc.id ? styles.subChannelActive : ""
                }`}
                onClick={() => setSelectedSubChannel(sc.id)}
              >
                <span className={styles.subChannelLabel}>
                  {sc.label}
                </span>
                <span className={styles.subChannelDesc}>{sc.desc}</span>
              </button>
            ))}
          </div>

          <h2 className={styles.sectionTitle}>Payment Method</h2>

          {gateways.length === 0 ? (

            <div className={styles.noGateways}>
              <p>No payment methods are currently available.</p>
              <p>Please contact support or try again later.</p>
            </div>
          ) : (
            <div className={styles.channelList}>
              {gateways.map((gw) => (
                <button
                  key={gw.channel}
                  className={`${styles.channel} ${
                    selectedChannel === gw.channel ? styles.channelActive : ""
                  }`}
                  onClick={() => setSelectedChannel(gw.channel)}
                >
                  {gw.logo ? (
                    <img
                      src={gw.logo}
                      alt={gw.label}
                      className={styles.channelLogo}
                    />
                  ) : CHANNEL_BRAND_ICONS[gw.channel] ? (
                    (() => {
                      const BrandIcon = CHANNEL_BRAND_ICONS[gw.channel];
                      return (
                        <span className={styles.channelIcon}>
                          <BrandIcon className={styles.channelBrandIcon} />
                        </span>
                      );
                    })()
                  ) : (
                    <span className={styles.channelIcon}>
                      {CHANNEL_ICONS[gw.channel] || "•"}
                    </span>
                  )}

                  <span className={styles.channelLabel}>
                    {gw.label}
                  </span>

                </button>
              ))}
            </div>
          )}

          {gateways.length > 0 && (
            <button
              className={styles.payBtn}
              onClick={handleCreateOrder}
              disabled={creating}
            >
              {creating ? "Creating order..." : "Continue to Payment"}
            </button>
          )}
        </div>
      </div>

      {/* Payment instructions */}
      {order && instructions && (
        <div className={styles.instructions}>
          <h2 className={styles.sectionTitle}>Payment Instructions</h2>
          <div className={styles.instructionBox}>
            <div className={styles.instructionRow}>
              <span>Order ID</span>
              <span className={styles.mono}>{order.orderId}</span>
            </div>
            <div className={styles.instructionRow}>
              <span>Amount</span>
              <span className={styles.mono}>${order.amountUsd} USD</span>
            </div>
            <div className={styles.instructionRow}>
              <span>Status</span>
              <span className={styles.statusPending}>{order.status}</span>
            </div>
            <div className={styles.instructionRow}>
              <span>Expires</span>
              <span className={styles.mono}>
                {new Date(order.expiresAt).toLocaleString()}
              </span>
            </div>

            {instructions.cryptoWallet && (
              <>
                <div className={styles.instructionDivider} />
                <div className={styles.instructionRow}>
                  <span>Network</span>
                  <span className={styles.mono}>
                    {instructions.cryptoWallet.network || "—"}
                  </span>
                </div>
                <div className={styles.instructionRow}>
                  <span>Wallet Address</span>
                  <span className={styles.walletAddress}>
                    {instructions.cryptoWallet.address || "Not configured"}
                  </span>
                </div>
                {instructions.cryptoWallet.memo && (
                  <div className={styles.instructionRow}>
                    <span>Memo</span>
                    <span className={styles.mono}>{instructions.cryptoWallet.memo}</span>
                  </div>
                )}
              </>
            )}

            {instructions.merchantId && (
              <>
                <div className={styles.instructionDivider} />
                <div className={styles.instructionRow}>
                  <span>Merchant</span>
                  <span className={styles.mono}>{instructions.merchantId}</span>
                </div>
              </>
            )}

            {instructions.instructions && (
              <div className={styles.instructionNote}>{instructions.instructions}</div>
            )}

            <div className={styles.instructionNote}>
              After completing the payment, our team will verify and activate your
              plan. This usually takes a few minutes.
            </div>

            <button
              className={styles.cancelBtn}
              onClick={() => handleCancelOrder(order.orderId)}
            >
              Cancel Order
            </button>
          </div>
        </div>
      )}

      {/* My orders */}
      {myOrders.length > 0 && (
        <div className={styles.orders}>
          <h2 className={styles.sectionTitle}>My Orders</h2>
          <div className={styles.orderTable}>
            <div className={styles.orderHeader}>
              <span>Order</span>
              <span>Plan</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Date</span>
            </div>
            {myOrders.map((o) => (
              <div key={o.orderId} className={styles.orderRow}>
                <span className={styles.mono}>{o.orderId}</span>
                <span>{o.plan}</span>
                <span>${o.amountUsd}</span>
                <span className={`${styles.status} ${styles[`status_${o.status}`]}`}>
                  {o.status}
                </span>
                <span>{new Date(o.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <button className={styles.backBtn} onClick={() => router.push("/pricing")}>
          ← Back to Pricing
        </button>
      </div>
    </div>
  );
};

export default CheckoutPage;

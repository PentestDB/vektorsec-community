"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlans } from "@/services/billing.service";
import styles from "./PricingPage.module.scss";

const FREE_PLAN_ID = "free";
const PRO_PLAN_ID = "pro";

// Display overrides so the free plan card always shows the welcome-trial
// copy regardless of what is stored in the DB (legacy seeds included).
const FREE_PLAN_DISPLAY = {
  name: "Welcome Trial",
  badge: "$0 First Time Only (One-Time Welcome Bonus)",
  features: [
    "10,000 welcome tokens (one-time at signup, no daily reset)",
    "1 concurrent session",
    "5 agent iterations / session",
    "20 trial requests",
  ],
  negativeFeatures: ["No advanced tools (Burp, Caido, VNC)"],
};

const PRO_PLAN_BADGE = "Recommended for Professionals";

const PRO_HIGHLIGHT_KEYWORDS = ["50,000", "Advanced tools"];

const PricingPage = () => {
  const router = useRouter();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billing, setBilling] = useState("monthly");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPlans();
        setPlans(data.plans || []);
      } catch (err) {
        setError("Failed to load pricing plans");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSelect = (plan) => {
    router.push("/register");
  };

  if (loading) {
    return <div className={styles.loading}>Loading plans...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Simple, transparent pricing</h1>
        <p className={styles.subtitle}>
          Start free. Upgrade when you're ready to scale your security testing.
        </p>

        <div className={styles.billingToggle}>
          <button
            className={`${styles.toggleBtn} ${billing === "monthly" ? styles.active : ""}`}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </button>
          <button
            className={`${styles.toggleBtn} ${billing === "annual" ? styles.active : ""}`}
            onClick={() => setBilling("annual")}
          >
            Annual <span className={styles.saveBadge}>Save 20%</span>
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => {
          const price = billing === "annual" ? plan.priceAnnual : plan.priceMonthly;
          const isFree = plan.id === FREE_PLAN_ID;
          const isPopular = plan.id === PRO_PLAN_ID;
          const displayName = isFree ? FREE_PLAN_DISPLAY.name : plan.name;
          const displayFeatures = isFree
            ? [
                ...FREE_PLAN_DISPLAY.features.map((text) => ({ text, negative: false })),
                ...FREE_PLAN_DISPLAY.negativeFeatures.map((text) => ({ text, negative: true })),
              ]
            : (plan.features || []).map((text) => ({
                text,
                negative: false,
                highlighted:
                  isPopular && PRO_HIGHLIGHT_KEYWORDS.some((kw) => text.includes(kw)),
              }));
          const showTokenLimits =
            !isFree &&
            (plan.limits?.maxTokensPerDay > 0 || plan.limits?.maxRequestsPerDay > 0);
          return (
            <div
              key={plan.id}
              className={`${styles.card} ${isPopular ? styles.popular : ""}`}
            >
              {isPopular && <div className={styles.popularBadge}>{PRO_PLAN_BADGE}</div>}
              <h2 className={styles.planName}>{displayName}</h2>
              {isFree ? (
                <div className={styles.freeBadge}>{FREE_PLAN_DISPLAY.badge}</div>
              ) : (
                <p className={styles.planDesc}>{plan.description}</p>
              )}

              <div className={styles.priceRow}>
                <span className={styles.price}>${price}</span>
                <span className={styles.perMonth}>/month</span>
              </div>
              {billing === "annual" && plan.priceAnnual > 0 && (
                <div className={styles.annualNote}>
                  Billed annually (${plan.priceAnnual * 12}/yr)
                </div>
              )}

              <button
                className={`${styles.selectBtn} ${isFree ? styles.freeBtn : ""}`}
                onClick={() => handleSelect(plan)}
              >
                {isFree ? "Get Free Tokens" : "Choose Plan"}
              </button>

              <ul className={styles.features}>
                {displayFeatures.map((item, i) => (
                  <li
                    key={i}
                    className={`${styles.feature} ${item.negative ? styles.featureNegative : ""} ${
                      item.highlighted ? styles.featureHighlight : ""
                    }`}
                  >
                    <span className={styles.check} aria-hidden="true" />
                    {item.text}
                  </li>
                ))}
              </ul>

              {showTokenLimits && (
                <div className={styles.tokenLimits}>
                  <div className={styles.tokenLimitsTitle}>API Usage Limits</div>
                  {plan.limits?.maxTokensPerDay > 0 && (
                    <div className={styles.tokenLimitItem}>
                      {Number(plan.limits.maxTokensPerDay).toLocaleString()}{" "}
                      tokens / day
                    </div>
                  )}
                  {plan.limits?.maxRequestsPerDay > 0 && (
                    <div className={styles.tokenLimitItem}>
                      {plan.limits.maxRequestsPerDay} requests / day
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>


      <div className={styles.footer}>
        <p>
          Need a custom plan?{" "}
          <a href="mailto:sales@vektorsec.com" className={styles.link}>
            Contact sales
          </a>
        </p>
      </div>
    </div>
  );
};

export default PricingPage;

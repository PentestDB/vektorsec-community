import styles from "@/styles/pages/Login.module.scss";

// Right-side showcase for Login / Register pages.
// Premium cyber-security glassmorphism cards with network map + recon feed.
const RECON_ROWS = [
  { domain: "api.example.com", status: "200 OK", cls: "reconOk" },
  { domain: "admin.example.com", status: "403 Forbidden", cls: "reconBlocked" },
  { domain: "dev.example.com", status: "200 OK", cls: "reconOk" },
  { domain: "staging.example.com", status: "scanning", cls: "reconPending" },
];

const AuthShowcase = () => {
  return (
    <section className={styles.showcasePane}>
      <div className={styles.showcaseBg} />

      <div className={styles.showcaseContent}>
        <div className={styles.showcaseHeader}>
          <h2>Unleash the Future of Pentesting</h2>
          <p>
            Autonomous AI-driven security operations with real-time recon,
            scanning, vulnerability analysis and reporting - all from a single
            command line.
          </p>
        </div>

        <div className={styles.tokenBadge}>
          <span className={styles.tokenBadgeIcon}>+10K</span>
          <span>
            Receive 10,000 Welcome Tokens Upon Signup (One-Time)
          </span>
        </div>

        <div className={styles.glassStack}>
          <div className={`${styles.glassCard} ${styles.glassCardBack}`} />
          <div className={`${styles.glassCard} ${styles.glassCardMid}`} />

          <div className={`${styles.glassCard} ${styles.glassCardFront}`}>
            <div className={styles.dashTop}>
              <div className={styles.dashTopLeft}>
                <span className={styles.dashEyebrow}>VektorSec Ops</span>
                <span className={styles.dashTitle}>
                  Security Operations Center
                </span>
              </div>
              <span className={styles.livePill}>
                <span className={styles.liveDot} />
                LIVE
              </span>
            </div>

            <div className={styles.dashStats}>
              <div className={styles.dashStat}>
                <span className={styles.dashStatLabel}>AI Tokens</span>
                <span className={styles.dashStatValue}>24,500</span>
              </div>
              <div className={styles.dashStat}>
                <span className={styles.dashStatLabel}>Active Scans</span>
                <span className={styles.dashStatValue}>03</span>
              </div>
              <div className={styles.dashStat}>
                <span className={styles.dashStatLabel}>Targets</span>
                <span className={styles.dashStatValue}>42</span>
              </div>
            </div>

            <div className={styles.dashPanel}>
              <div className={styles.dashPanelHeader}>
                <span>Network Map</span>
                <span className={styles.dashPanelHint}>auto-recon</span>
              </div>
              <div className={styles.networkMap}>
                <svg viewBox="0 0 320 112" fill="none" preserveAspectRatio="xMidYMid meet">
                  <line x1="30" y1="56" x2="112" y2="30" stroke="#00f2fe" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line x1="112" y1="30" x2="200" y2="20" stroke="#00f2fe" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line x1="112" y1="30" x2="160" y2="76" stroke="#00e676" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line x1="30" y1="56" x2="160" y2="76" stroke="#00e676" strokeOpacity="0.4" strokeWidth="1.5" />
                  <line x1="160" y1="76" x2="240" y2="60" stroke="#00f2fe" strokeOpacity="0.5" strokeWidth="1.5" />
                  <line x1="200" y1="20" x2="290" y2="42" stroke="#00f2fe" strokeOpacity="0.4" strokeWidth="1.5" />
                  <line x1="160" y1="76" x2="280" y2="92" stroke="#00e676" strokeOpacity="0.4" strokeWidth="1.5" />
                  <circle cx="30" cy="56" r="6" fill="#0d1117" stroke="#00f2fe" strokeWidth="2" />
                  <circle cx="112" cy="30" r="6" fill="#0d1117" stroke="#00f2fe" strokeWidth="2" />
                  <circle cx="200" cy="20" r="5" fill="#0d1117" stroke="#00e676" strokeWidth="2" />
                  <circle cx="160" cy="76" r="5" fill="#0d1117" stroke="#00e676" strokeWidth="2" />
                  <circle cx="240" cy="60" r="4" fill="#00f2fe" />
                  <circle cx="290" cy="42" r="4" fill="#00e676" />
                  <circle cx="280" cy="92" r="4" fill="#00f2fe" />
                </svg>
              </div>
            </div>

            <div className={styles.dashPanel}>
              <div className={styles.dashPanelHeader}>
                <span>Subdomain Recon</span>
                <span className={styles.dashPanelHint}>8 resolved</span>
              </div>
              <div className={styles.reconList}>
                {RECON_ROWS.map((row) => (
                  <div key={row.domain} className={styles.reconRow}>
                    <span className={styles.reconDomain}>{row.domain}</span>
                    <span className={`${styles.reconStatus} ${styles[row.cls]}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AuthShowcase;

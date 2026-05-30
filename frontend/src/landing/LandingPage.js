/**
 * Yala Landing Page — Uber/Lyft inspired professional design.
 * Clean, minimal, high-contrast with Yala brand colors.
 */
import React from "react";
import { MARKET } from "../marketConfig";

const LOGO = "/yala-logo.png";
const C = {
  green: "#00A651",
  gold: "#D4AF37",
  navy: "#08111F",
  dark: "#0a0a0a",
  card: "#141414",
  border: "#222",
  text: "#ffffff",
  muted: "#a3a3a3",
};

export default function LandingPage() {
  return (
    <div style={styles.page}>
      {/* ── Navbar ── */}
      <nav style={styles.nav}>
        <div style={styles.navInner}>
          <div style={styles.navBrand} onClick={() => window.location.href = "/"}>
            <img src={LOGO} alt="Yala" style={styles.navLogo} />
            <span style={styles.navName}>Yala</span>
          </div>
          <div style={styles.navLinks}>
            <button onClick={() => window.location.href = "/rider-dashboard"} style={styles.navLink}>Rider</button>
            <button onClick={() => window.location.href = "/driver"} style={styles.navLink}>Driver</button>
            <button onClick={() => window.location.href = "/admin"} style={styles.navLink}>Admin</button>
          </div>
          <div style={styles.navAuth}>
            <button onClick={() => window.location.href = "/login"} style={styles.loginBtn}>Log in</button>
            <button onClick={() => window.location.href = "/register"} style={styles.signupBtn}>Sign up</button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.heroText}>
            <div style={styles.badge}>🇲🇷 Mauritania's ride platform</div>
            <h1 style={styles.heroTitle}>Move freely.<br/>Earn daily.<br/>Manage everything.</h1>
            <p style={styles.heroSub}>
              Yala connects riders, drivers, and operators across {MARKET.cities.length}+ cities in Mauritania. Fast. Safe. Local.
            </p>
            <div style={styles.heroCtas}>
              <button onClick={() => window.location.href = "/rider-dashboard"} style={styles.ctaPrimary}>
                Request a ride
              </button>
              <button onClick={() => window.location.href = "/driver"} style={styles.ctaSecondary}>
                Start driving
              </button>
            </div>
          </div>
          <div style={styles.heroVisual}>
            <img src={LOGO} alt="Yala" style={styles.heroLogo} />
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={styles.stats}>
        {[
          { num: `${MARKET.cities.length}+`, label: "Cities" },
          { num: "24/7", label: "Operations" },
          { num: "3", label: "Apps in one" },
          { num: "30%", label: "Commission" },
        ].map((s) => (
          <div key={s.label} style={styles.statCard}>
            <strong style={styles.statNum}>{s.num}</strong>
            <span style={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </section>

      {/* ── Three Apps ── */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Three apps. One platform.</h2>
        <p style={styles.sectionSub}>Everything riders, drivers, and admins need — built for Mauritania.</p>
        <div style={styles.appGrid}>
          <AppCard
            color={C.green}
            title="Yala Rider"
            desc="Book rides, track your driver live, pay with Bankily, Masravi, or cash."
            cta="Open Rider"
            path="/rider-dashboard"
          />
          <AppCard
            color={C.gold}
            title="Yala Driver"
            desc="Go online, accept trips, navigate, earn money, and withdraw instantly."
            cta="Open Driver"
            path="/driver"
          />
          <AppCard
            color={C.navy}
            title="Yala Admin"
            desc="Approve drivers, monitor rides, track revenue, and manage operations."
            cta="Open Admin"
            path="/admin"
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>How Yala works</h2>
        <div style={styles.stepsGrid}>
          {[
            { step: "1", title: "Request", desc: "Choose pickup and destination. See fare upfront." },
            { step: "2", title: "Match", desc: "A nearby driver accepts your ride in seconds." },
            { step: "3", title: "Ride", desc: "Track your driver live. Arrive safely." },
            { step: "4", title: "Pay", desc: "Cash, Bankily, Masravi, Seddad, or card." },
          ].map((s) => (
            <div key={s.step} style={styles.stepCard}>
              <span style={styles.stepNum}>{s.step}</span>
              <h3 style={styles.stepTitle}>{s.title}</h3>
              <p style={styles.stepDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Safety ── */}
      <section style={{ ...styles.section, background: C.card, borderRadius: 24, margin: "0 20px", padding: "48px 32px" }}>
        <h2 style={styles.sectionTitle}>Safety first</h2>
        <div style={styles.safetyGrid}>
          {[
            { icon: "🛡️", title: "Verified drivers", desc: "License, insurance, and ID checked before approval." },
            { icon: "📞", title: "Private calling", desc: "Your real phone number is never shared." },
            { icon: "🚨", title: "Emergency access", desc: "One-tap access to police, ambulance, and fire." },
          ].map((s) => (
            <div key={s.title} style={styles.safetyCard}>
              <span style={{ fontSize: 28 }}>{s.icon}</span>
              <h3 style={styles.safetyTitle}>{s.title}</h3>
              <p style={styles.safetyDesc}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={styles.ctaSection}>
        <h2 style={styles.ctaSectionTitle}>Ready to move?</h2>
        <p style={styles.ctaSectionSub}>Join thousands of riders and drivers across Mauritania.</p>
        <div style={styles.heroCtas}>
          <button onClick={() => window.location.href = "/register"} style={styles.ctaPrimary}>Create account</button>
          <button onClick={() => window.location.href = "/login"} style={styles.ctaSecondary}>Log in</button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <div style={styles.footerBrand}>
            <img src={LOGO} alt="Yala" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Yala</span>
          </div>
          <div style={styles.footerLinks}>
            <button onClick={() => window.location.href = "/terms"} style={styles.footerLink}>Terms</button>
            <button onClick={() => window.location.href = "/privacy"} style={styles.footerLink}>Privacy</button>
            <button onClick={() => window.location.href = "/support"} style={styles.footerLink}>Support</button>
          </div>
          <span style={styles.footerCopy}>© 2026 Yala. Fast. Safe. Local.</span>
        </div>
      </footer>
    </div>
  );
}

function AppCard({ color, title, desc, cta, path }) {
  return (
    <div style={{ ...styles.appCard, borderColor: color + "33" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = color}
      onMouseLeave={e => e.currentTarget.style.borderColor = color + "33"}>
      <div style={{ ...styles.appDot, background: color }} />
      <h3 style={styles.appTitle}>{title}</h3>
      <p style={styles.appDesc}>{desc}</p>
      <button onClick={() => window.location.href = path} style={{ ...styles.appBtn, background: color, color: color === C.gold ? C.navy : "#fff" }}>
        {cta}
      </button>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: C.dark, color: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },

  // Nav
  nav: { position: "sticky", top: 0, zIndex: 100, background: "rgba(10,10,10,0.85)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}` },
  navInner: { maxWidth: 1200, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  navBrand: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" },
  navLogo: { width: 38, height: 38, borderRadius: 10, objectFit: "cover" },
  navName: { fontSize: 20, fontWeight: 800, color: C.text },
  navLinks: { display: "flex", gap: 4 },
  navLink: { padding: "8px 16px", border: 0, borderRadius: 8, background: "transparent", color: C.muted, fontWeight: 600, fontSize: 14, cursor: "pointer" },
  navAuth: { display: "flex", gap: 8 },
  loginBtn: { padding: "9px 18px", border: 0, borderRadius: 8, background: "transparent", color: C.text, fontWeight: 600, fontSize: 14, cursor: "pointer" },
  signupBtn: { padding: "9px 18px", border: 0, borderRadius: 8, background: C.green, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },

  // Hero
  hero: { maxWidth: 1200, margin: "0 auto", padding: "80px 24px 60px" },
  heroContent: { display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 48, alignItems: "center" },
  heroText: {},
  badge: { display: "inline-block", padding: "6px 14px", borderRadius: 999, background: C.green + "18", color: C.green, fontSize: 13, fontWeight: 700, marginBottom: 20 },
  heroTitle: { margin: 0, fontSize: "clamp(40px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.03em" },
  heroSub: { margin: "20px 0 0", fontSize: 18, color: C.muted, lineHeight: 1.6, maxWidth: 520 },
  heroCtas: { display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" },
  ctaPrimary: { padding: "14px 28px", border: 0, borderRadius: 10, background: C.green, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "transform 0.15s", boxShadow: "0 8px 24px rgba(0,166,81,0.25)" },
  ctaSecondary: { padding: "14px 28px", border: `1px solid ${C.border}`, borderRadius: 10, background: "transparent", color: C.text, fontSize: 16, fontWeight: 700, cursor: "pointer" },
  heroVisual: { display: "flex", justifyContent: "center", alignItems: "center" },
  heroLogo: { width: "min(320px, 80%)", height: "auto", filter: "drop-shadow(0 20px 60px rgba(0,166,81,0.2))" },

  // Stats
  stats: { maxWidth: 1200, margin: "0 auto", padding: "0 24px 60px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  statCard: { background: C.card, borderRadius: 16, padding: "24px 20px", textAlign: "center", border: `1px solid ${C.border}` },
  statNum: { display: "block", fontSize: 32, fontWeight: 800, color: C.green },
  statLabel: { display: "block", marginTop: 4, fontSize: 13, color: C.muted, fontWeight: 600 },

  // Sections
  section: { maxWidth: 1200, margin: "0 auto", padding: "60px 24px" },
  sectionTitle: { margin: 0, fontSize: 32, fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em" },
  sectionSub: { margin: "10px auto 0", textAlign: "center", color: C.muted, fontSize: 16, maxWidth: 500 },

  // App cards
  appGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 36 },
  appCard: { background: C.card, borderRadius: 20, padding: "28px 24px", border: "1px solid", transition: "border-color 0.3s" },
  appDot: { width: 12, height: 12, borderRadius: "50%", marginBottom: 16 },
  appTitle: { margin: "0 0 8px", fontSize: 20, fontWeight: 700 },
  appDesc: { margin: "0 0 20px", color: C.muted, fontSize: 14, lineHeight: 1.6 },
  appBtn: { padding: "10px 20px", border: 0, borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" },

  // Steps
  stepsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 36 },
  stepCard: { background: C.card, borderRadius: 16, padding: "24px 20px", border: `1px solid ${C.border}` },
  stepNum: { display: "inline-flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: "50%", background: C.green, color: "#fff", fontWeight: 800, fontSize: 14, marginBottom: 12 },
  stepTitle: { margin: "0 0 6px", fontSize: 16, fontWeight: 700 },
  stepDesc: { margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.5 },

  // Safety
  safetyGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 28 },
  safetyCard: { padding: "20px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` },
  safetyTitle: { margin: "10px 0 6px", fontSize: 15, fontWeight: 700 },
  safetyDesc: { margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.5 },

  // CTA section
  ctaSection: { maxWidth: 1200, margin: "0 auto", padding: "60px 24px", textAlign: "center" },
  ctaSectionTitle: { margin: 0, fontSize: 36, fontWeight: 800 },
  ctaSectionSub: { margin: "12px 0 28px", color: C.muted, fontSize: 16 },

  // Footer
  footer: { borderTop: `1px solid ${C.border}`, marginTop: 40 },
  footerInner: { maxWidth: 1200, margin: "0 auto", padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  footerBrand: { display: "flex", alignItems: "center", gap: 8 },
  footerLinks: { display: "flex", gap: 4 },
  footerLink: { padding: "8px 12px", border: 0, background: "transparent", color: C.muted, fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 6 },
  footerCopy: { color: "#555", fontSize: 12 },
};

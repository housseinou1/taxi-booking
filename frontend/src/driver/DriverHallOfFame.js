import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { isDriverLyftUI } from "./lyftColors";


export default function DriverHallOfFame() {
  const lyftUI = isDriverLyftUI();
  const [data, setData] = useState({ my_recognitions: [], my_stats: {}, achievement_badges: [], driver_of_month: [], top_city: [], top_mauritania: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/drivers/hall-of-fame/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access")}` },
      });
      const next = await response.json();
      if (response.ok) setData(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <main className={lyftUI ? "hof-page hof-page--lyft driver-page--lyft" : "hof-page"}>
      <HallStyles lyft={lyftUI} />
      <header className="hof-hero">
        {!lyftUI && (
          <button type="button" onClick={() => (window.location.href = "/driver/achievements")}>Back</button>
        )}
        <span>Yala Driver Recognition</span>
        <h1>Hall of Fame</h1>
        <p>Celebrating Mauritania's most loyal, trusted, and accomplished Yala drivers.</p>
      </header>
      {loading ? <p className="hof-loading">Calculating Hall of Fame rankings...</p> : (
        <>
          <RecognitionSection title="Your Hall of Fame" items={data.my_recognitions} empty="Complete lifetime milestones and lead your city to earn recognition." />
          <section className="hof-section">
            <h2>Your Lifetime Progress</h2>
            <div className="hof-progress">
              <div><b>{data.my_stats?.lifetime_completed_rides || 0}</b><span>Lifetime completed rides</span></div>
              <div><b>{data.my_stats?.years_with_yala || 0}</b><span>Years with Yala</span></div>
              <div><b>{data.my_stats?.performance_score || 0}</b><span>Performance score</span></div>
            </div>
          </section>
          <section className="hof-section">
            <h2>Achievement Badges</h2>
            {data.achievement_badges?.length ? (
              <div className="hof-achievements">
                {data.achievement_badges.map((item) => (
                  <article key={item.id}><b>{item.icon || "Badge"}</b><strong>{item.name}</strong><small>{item.description}</small></article>
                ))}
              </div>
            ) : <p className="hof-empty">No achievement badges earned yet.</p>}
          </section>
          <RecognitionSection title="Driver of the Month" items={data.driver_of_month} />
          <RecognitionSection title="Top Drivers in Mauritania" items={data.top_mauritania} />
          <RecognitionSection title="Top Drivers by City" items={data.top_city} />
        </>
      )}
    </main>
  );
}

function RecognitionSection({ title, items = [], empty = "No winners recorded yet." }) {
  return (
    <section className="hof-section">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="hof-empty">{empty}</p> : (
        <div className="hof-grid">
          {items.map((item) => <RecognitionCard key={item.id} item={item} />)}
        </div>
      )}
    </section>
  );
}

function RecognitionCard({ item }) {
  return (
    <article className={`hof-card ${item.badge}`}>
      <div className="hof-badge">{item.badge}</div>
      <span>{item.category.replaceAll("_", " ")}</span>
      <h3>{item.title}</h3>
      <strong>{item.driver_name}</strong>
      <p>{item.city || "Mauritania"} · {item.month ? `${item.month}/` : ""}{item.year}</p>
      <div className="hof-stats">
        <div><b>{item.lifetime_completed_rides}</b><small>Lifetime rides</small></div>
        <div><b>{item.years_with_yala}</b><small>Years with Yala</small></div>
        <div><b>{item.performance_score}</b><small>Performance</small></div>
      </div>
    </article>
  );
}

function HallStyles({ lyft = false }) {
  if (lyft) {
    return <style>{`
    .hof-page--lyft{min-height:auto;background:#f3f4f6;color:#111827;padding:8px 0 24px;font-family:"Plus Jakarta Sans",Inter,"Segoe UI",sans-serif}
    .hof-page--lyft .hof-hero,.hof-page--lyft .hof-section{max-width:1100px;margin:0 auto}.hof-page--lyft .hof-hero{padding:8px 0 20px;border-bottom:1px solid #e5e7eb}
    .hof-page--lyft .hof-hero span{display:block;margin-top:8px;color:#00A651;font-size:12px;font-weight:900;text-transform:uppercase}.hof-page--lyft .hof-hero h1{font-size:28px;margin:6px 0;color:#111827;letter-spacing:-0.02em}.hof-page--lyft .hof-hero p,.hof-page--lyft .hof-empty,.hof-page--lyft .hof-loading{color:#6b7280}
    .hof-page--lyft .hof-section{padding-top:20px}.hof-page--lyft .hof-section h2{font-size:18px;color:#111827}.hof-page--lyft .hof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}
    .hof-page--lyft .hof-card{position:relative;border:1px solid #e5e7eb;border-left:5px solid #00A651;border-radius:12px;background:#fff;padding:15px;color:#111827}.hof-page--lyft .hof-card.silver{border-left-color:#94a3b8}.hof-page--lyft .hof-card.bronze{border-left-color:#d97706}
    .hof-page--lyft .hof-badge{position:absolute;right:12px;top:12px;border-radius:999px;background:#00A651;color:#fff;padding:4px 8px;font-size:10px;font-weight:800;text-transform:uppercase}.hof-page--lyft .hof-card.silver .hof-badge{background:#64748b}.hof-page--lyft .hof-card.bronze .hof-badge{background:#d97706}
    .hof-page--lyft .hof-card>span{color:#6b7280;font-size:11px;font-weight:800;text-transform:uppercase}.hof-page--lyft .hof-card h3{margin:10px 0 6px;color:#111827}.hof-page--lyft .hof-card p{color:#6b7280;font-size:13px}
    .hof-page--lyft .hof-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:14px}.hof-page--lyft .hof-stats div{background:#f3f4f6;padding:8px;border-radius:8px;text-align:center}.hof-page--lyft .hof-stats b,.hof-page--lyft .hof-stats small{display:block}.hof-page--lyft .hof-stats small{color:#6b7280;font-size:10px;margin-top:3px}
    .hof-page--lyft .hof-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hof-page--lyft .hof-progress div,.hof-page--lyft .hof-achievements article{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:14px}.hof-page--lyft .hof-progress b,.hof-page--lyft .hof-progress span,.hof-page--lyft .hof-achievements b,.hof-page--lyft .hof-achievements strong,.hof-page--lyft .hof-achievements small{display:block}.hof-page--lyft .hof-progress b{font-size:28px;color:#00A651}.hof-page--lyft .hof-progress span,.hof-page--lyft .hof-achievements small{color:#6b7280;margin-top:5px}.hof-page--lyft .hof-achievements{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.hof-page--lyft .hof-achievements b{font-size:27px;margin-bottom:7px}
    @media(max-width:600px){.hof-page--lyft .hof-progress{grid-template-columns:1fr}}
  `}</style>;
  }

  return <style>{`
    .hof-page{min-height:100vh;background:#07111f;color:#fff;padding:18px 16px 80px;font-family:Inter,"Segoe UI",sans-serif}
    .hof-hero,.hof-section{max-width:1100px;margin:0 auto}.hof-hero{padding:20px 0 26px;border-bottom:1px solid rgba(255,255,255,.12)}
    .hof-hero button{border:1px solid rgba(255,255,255,.2);border-radius:6px;background:#132033;color:#fff;padding:8px 11px;cursor:pointer}
    .hof-hero span{display:block;margin-top:24px;color:#facc15;font-size:12px;font-weight:900;text-transform:uppercase}.hof-hero h1{font-size:42px;margin:6px 0;letter-spacing:0}.hof-hero p,.hof-empty,.hof-loading{color:#94a3b8}
    .hof-section{padding-top:24px}.hof-section h2{font-size:21px;letter-spacing:0}.hof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}
    .hof-card{position:relative;border:1px solid rgba(255,255,255,.13);border-left:5px solid #a16207;border-radius:7px;background:#101c2c;padding:15px}.hof-card.silver{border-left-color:#cbd5e1}.hof-card.bronze{border-left-color:#b45309}
    .hof-badge{position:absolute;right:12px;top:12px;border-radius:4px;background:#facc15;color:#111827;padding:4px 7px;font-size:11px;font-weight:950;text-transform:uppercase}.hof-card.silver .hof-badge{background:#e2e8f0}.hof-card.bronze .hof-badge{background:#d97706;color:#fff}
    .hof-card>span{color:#94a3b8;font-size:11px;font-weight:850;text-transform:uppercase}.hof-card h3{margin:10px 0 6px;letter-spacing:0}.hof-card p{color:#94a3b8;font-size:13px}
    .hof-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:14px}.hof-stats div{background:rgba(255,255,255,.06);padding:8px;border-radius:5px;text-align:center}.hof-stats b,.hof-stats small{display:block}.hof-stats small{color:#94a3b8;font-size:10px;margin-top:3px}
    .hof-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hof-progress div,.hof-achievements article{border:1px solid rgba(255,255,255,.12);border-radius:6px;background:#101c2c;padding:14px}.hof-progress b,.hof-progress span,.hof-achievements b,.hof-achievements strong,.hof-achievements small{display:block}.hof-progress b{font-size:28px;color:#facc15}.hof-progress span,.hof-achievements small{color:#94a3b8;margin-top:5px}.hof-achievements{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}.hof-achievements b{font-size:27px;margin-bottom:7px}
    @media(max-width:600px){.hof-progress{grid-template-columns:1fr}}
  `}</style>;
}

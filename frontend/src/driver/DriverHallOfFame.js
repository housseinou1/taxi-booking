import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { isDriverYalaUI } from "./yalaColors";
import "./DriverHallOfFame.css";

export default function DriverHallOfFame() {
  const yalaUI = isDriverYalaUI();
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
    <main className={yalaUI ? "hof-page hof-page--lyft driver-page--lyft" : "hof-page"}>
      <header className="hof-hero">
        {!yalaUI && (
          <button
            type="button"
            className="hof-hero__back"
            onClick={() => (window.location.href = "/driver/achievements")}
            aria-label="Back to achievements"
          >
            Back
          </button>
        )}
        <span className="hof-hero__eyebrow" aria-hidden="true">Yala Driver Recognition</span>
        <h1>Hall of Fame</h1>
        <p>Celebrating Mauritania's most loyal, trusted, and accomplished Yala drivers.</p>
      </header>
      {loading ? <p className="hof-loading">Calculating Hall of Fame rankings...</p> : (
        <>
          <RecognitionSection title="Your Hall of Fame" items={data.my_recognitions} empty="Complete lifetime milestones and lead your city to earn recognition." />
          <section className="hof-section" aria-labelledby="lifetime-progress">
            <h2 id="lifetime-progress">Your Lifetime Progress</h2>
            <div className="hof-progress" role="list" aria-label="Lifetime statistics">
              <div role="listitem"><b>{data.my_stats?.lifetime_completed_rides || 0}</b><span>Lifetime completed rides</span></div>
              <div role="listitem"><b>{data.my_stats?.years_with_yala || 0}</b><span>Years with Yala</span></div>
              <div role="listitem"><b>{data.my_stats?.performance_score || 0}</b><span>Performance score</span></div>
            </div>
          </section>
          <section className="hof-section" aria-labelledby="achievement-badges">
            <h2 id="achievement-badges">Achievement Badges</h2>
            {data.achievement_badges?.length ? (
              <ul className="hof-achievements" aria-label="Achievement badges">
                {data.achievement_badges.map((item) => (
                  <li key={item.id}>
                    <b aria-hidden="true">{item.icon || "Badge"}</b>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </li>
                ))}
              </ul>
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
  const headingId = title.replace(/\s+/g, "-").toLowerCase();
  return (
    <section className="hof-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {items.length === 0 ? <p className="hof-empty">{empty}</p> : (
        <ol className="hof-grid" aria-label={`${title} leaderboard`}>
          {items.map((item, index) => <RecognitionCard key={item.id} item={item} rank={index + 1} />)}
        </ol>
      )}
    </section>
  );
}

function RecognitionCard({ item, rank }) {
  return (
    <li className={`hof-card ${item.badge}`} aria-label={`Rank ${rank}: ${item.driver_name}, ${item.title}`}>
      <div className="hof-badge">{item.badge}</div>
      <span className="hof-card__category">{item.category.replaceAll("_", " ")}</span>
      <h3>{item.title}</h3>
      <strong>{item.driver_name}</strong>
      <p>{item.city || "Mauritania"} · {item.month ? `${item.month}/` : ""}{item.year}</p>
      <div className="hof-stats">
        <div><b>{item.lifetime_completed_rides}</b><small>Lifetime rides</small></div>
        <div><b>{item.years_with_yala}</b><small>Years with Yala</small></div>
        <div><b>{item.performance_score}</b><small>Performance</small></div>
      </div>
    </li>
  );
}

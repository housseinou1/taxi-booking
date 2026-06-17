import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";


export default function HallOfFameAdminPanel({ cities = [] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [city, setCity] = useState("");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (city) params.set("city", city);
      const response = await fetch(`${API_URL}/drivers/hall-of-fame/admin/?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access")}` },
      });
      const data = await response.json();
      setMembers(response.ok && Array.isArray(data.members) ? data.members : []);
    } finally {
      setLoading(false);
    }
  }, [city, year]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <section className="admin-hof">
      <AdminHallStyles />
      <header>
        <div><span>Driver recognition</span><h2>Hall of Fame</h2><p>Track monthly winners, city leaders, national rankings, and lifetime loyalty milestones.</p></div>
        <div className="admin-hof-filters">
          <select value={city} onChange={(event) => setCity(event.target.value)}>
            <option value="">All cities</option>
            {cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(event.target.value)} />
        </div>
      </header>
      {loading ? <p>Refreshing Hall of Fame...</p> : members.length === 0 ? <p>No Hall of Fame members for this filter.</p> : (
        <div className="admin-hof-list">
          {members.map((member) => (
            <article key={member.id}>
              <b className={member.badge}>{member.badge}</b>
              <div><span>{member.category.replaceAll("_", " ")}</span><h3>{member.title}</h3><strong>{member.driver_name}</strong><p>{member.city || "Mauritania"} · {member.month ? `${member.month}/` : ""}{member.year}</p></div>
              <dl><div><dt>Lifetime rides</dt><dd>{member.lifetime_completed_rides}</dd></div><div><dt>Years</dt><dd>{member.years_with_yala}</dd></div><div><dt>Score</dt><dd>{member.performance_score}</dd></div></dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminHallStyles() {
  return <style>{`
    .admin-hof header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.admin-hof header span{color:#a16207;font-size:12px;font-weight:900;text-transform:uppercase}.admin-hof h2{margin:5px 0;letter-spacing:0}.admin-hof header p{margin:0;color:#64748b}
    .admin-hof-filters{display:flex;gap:8px}.admin-hof-filters select,.admin-hof-filters input{border:1px solid #cbd5e1;border-radius:6px;padding:9px;background:#fff}.admin-hof-list{display:grid;gap:9px}.admin-hof-list article{display:grid;grid-template-columns:70px 1fr auto;gap:12px;align-items:center;border:1px solid #e2e8f0;border-radius:7px;padding:12px;background:#fff}.admin-hof-list b{border-radius:5px;background:#facc15;padding:8px;text-align:center;text-transform:uppercase}.admin-hof-list b.silver{background:#e2e8f0}.admin-hof-list b.bronze{background:#d97706;color:#fff}.admin-hof-list h3{margin:3px 0;letter-spacing:0}.admin-hof-list p{margin:4px 0;color:#64748b}.admin-hof-list dl{display:flex;gap:8px;margin:0}.admin-hof-list dl div{min-width:75px;background:#f8fafc;padding:7px;text-align:center}.admin-hof-list dt{font-size:10px;color:#64748b}.admin-hof-list dd{margin:3px 0 0;font-weight:900}@media(max-width:800px){.admin-hof header,.admin-hof-list article{display:grid;grid-template-columns:1fr}.admin-hof-list dl{flex-wrap:wrap}}
  `}</style>;
}

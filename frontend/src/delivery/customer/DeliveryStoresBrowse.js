import React, { useEffect, useState } from "react";

import { API_URL } from "../../apiConfig";
import { MARKET } from "../../marketConfig";
import { STORE_CATEGORY_MAP, fetchStores } from "../../merchant/merchantApi";

function mediaUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default function DeliveryStoresBrowse({ category, onSelectStore, onBack }) {
  const [stores, setStores] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const filters = {
          lat: MARKET.center[0],
          lng: MARKET.center[1],
          ...(STORE_CATEGORY_MAP[category] || {}),
        };
        if (query.trim()) filters.q = query.trim();
        const data = await fetchStores(filters);
        setStores(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [category, query]);

  return (
    <div className="delivery-uber__stores">
      <div className="delivery-uber__plan-head">
        <button type="button" className="delivery-uber__back-circle" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h2>Nearby stores</h2>
          <p>Browse and order from local merchants</p>
        </div>
      </div>

      <label className="delivery-uber__store-search">
        <span aria-hidden>⌕</span>
        <input placeholder="Search stores..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {loading ? <p className="delivery-uber__muted">Finding nearby stores...</p> : null}
      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}

      <div className="delivery-uber__store-list">
        {stores.map((store) => (
          <button key={store.id} type="button" className="delivery-uber__store-row" onClick={() => onSelectStore(store)}>
            {store.logo ? (
              <img className="delivery-uber__store-row-logo" src={mediaUrl(store.logo)} alt="" />
            ) : (
              <span className="delivery-uber__store-row-logo delivery-uber__store-row-logo--placeholder" aria-hidden>
                🏪
              </span>
            )}
            <span className="delivery-uber__store-row-body">
              <strong>{store.business_name}</strong>
              <small>
                ★ {store.rating} · {store.delivery_time || 25} min
                {store.distance_km != null ? ` · ${store.distance_km} km` : ""}
                {store.delivery_fee ? ` · ${store.delivery_fee} MRU` : ""}
              </small>
            </span>
            <span className="delivery-uber__list-row-chevron" aria-hidden>
              ›
            </span>
          </button>
        ))}
      </div>

      {!loading && stores.length === 0 ? <p className="delivery-uber__muted">No stores found nearby.</p> : null}
    </div>
  );
}

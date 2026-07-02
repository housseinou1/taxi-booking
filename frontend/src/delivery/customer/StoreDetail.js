import React, { useEffect, useMemo, useState } from "react";

import { API_URL } from "../../apiConfig";
import { addCartItem, fetchStoreProducts } from "../../merchant/merchantApi";

function mediaUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export default function StoreDetail({ store, onBack, onOpenCart }) {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [addedId, setAddedId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchStoreProducts(store.id, category);
        setProducts(data);
      } catch (err) {
        setError(err.message);
      }
    };
    load();
  }, [store.id, category]);

  const categories = useMemo(
    () => [...new Set(products.map((item) => item.category).filter(Boolean))].sort(),
    [products]
  );

  const handleAdd = async (product) => {
    setBusyId(product.id);
    setError("");
    try {
      await addCartItem(product.id, 1);
      setAddedId(product.id);
      setTimeout(() => setAddedId(null), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const logoUrl = mediaUrl(store.logo || store.store_cover_image);

  return (
    <div className="store-detail">
      {/* Store header */}
      <header className="store-detail__header">
        <button type="button" className="store-detail__back" onClick={onBack} aria-label="Back">←</button>
        <div className="store-detail__info">
          {logoUrl ? (
            <img className="store-detail__logo" src={logoUrl} alt="" />
          ) : (
            <span className="store-detail__logo store-detail__logo--placeholder">🏪</span>
          )}
          <div>
            <h2 className="store-detail__name">{store.business_name}</h2>
            <p className="store-detail__meta">
              ★ {store.rating || "4.5"} · {store.delivery_time || 25} min
              {store.delivery_fee ? ` · ${store.delivery_fee} MRU delivery` : ""}
            </p>
          </div>
        </div>
      </header>

      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}

      {/* Category filter */}
      {categories.length > 1 ? (
        <div className="store-detail__categories">
          <button
            type="button"
            className={`store-detail__cat-chip ${!category ? "is-active" : ""}`}
            onClick={() => setCategory("")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`store-detail__cat-chip ${category === cat ? "is-active" : ""}`}
              onClick={() => setCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      {/* Product grid */}
      <div className="store-detail__products">
        {products.map((product) => {
          const imgUrl = mediaUrl(product.image);
          const isAdded = addedId === product.id;
          return (
            <article key={product.id} className="store-detail__product">
              {imgUrl ? (
                <img className="store-detail__product-img" src={imgUrl} alt="" />
              ) : (
                <div className="store-detail__product-img store-detail__product-img--placeholder">
                  <span>🛒</span>
                </div>
              )}
              <div className="store-detail__product-body">
                <strong>{product.product_name}</strong>
                {product.description ? <p>{product.description}</p> : null}
                <span className="store-detail__product-price">
                  {product.effective_price || product.price} MRU
                </span>
              </div>
              <button
                type="button"
                className={`store-detail__add-btn ${isAdded ? "is-added" : ""}`}
                disabled={busyId === product.id}
                onClick={() => handleAdd(product)}
              >
                {isAdded ? "✓" : "+"}
              </button>
            </article>
          );
        })}
        {products.length === 0 ? (
          <p className="store-detail__empty">No products available yet.</p>
        ) : null}
      </div>

      {/* Floating cart button */}
      <button
        type="button"
        className="store-detail__cart-btn"
        onClick={() => onOpenCart(store)}
      >
        <span>🛒</span> View cart
      </button>

      <StoreDetailStyles />
    </div>
  );
}

function StoreDetailStyles() {
  return (
    <style>{`
      .store-detail {
        display: grid;
        gap: 16px;
        padding-bottom: 80px;
      }

      .store-detail__header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .store-detail__back {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 12px;
        background: #f3f4f6;
        font-size: 18px;
        cursor: pointer;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }

      .store-detail__info {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
      }

      .store-detail__logo {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        object-fit: cover;
        background: #f9fafb;
        display: grid;
        place-items: center;
        font-size: 22px;
        flex-shrink: 0;
      }

      .store-detail__name {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        color: #111827;
      }

      .store-detail__meta {
        margin: 2px 0 0;
        font-size: 12px;
        color: #6b7280;
      }

      .store-detail__categories {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 2px 0;
        -webkit-overflow-scrolling: touch;
      }

      .store-detail__cat-chip {
        padding: 8px 14px;
        border: 1.5px solid #e5e7eb;
        border-radius: 999px;
        background: #fff;
        font-size: 13px;
        font-weight: 600;
        color: #374151;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.15s;
      }

      .store-detail__cat-chip.is-active {
        border-color: #FF6B00;
        background: #fff7ed;
        color: #EA580C;
      }

      .store-detail__products {
        display: grid;
        gap: 12px;
      }

      .store-detail__product {
        display: grid;
        grid-template-columns: 80px 1fr 40px;
        gap: 12px;
        align-items: center;
        padding: 12px;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }

      .store-detail__product-img {
        width: 80px;
        height: 80px;
        border-radius: 12px;
        object-fit: cover;
        background: #f9fafb;
        display: grid;
        place-items: center;
      }

      .store-detail__product-img--placeholder {
        font-size: 28px;
        background: #f3f4f6;
      }

      .store-detail__product-body {
        min-width: 0;
      }

      .store-detail__product-body strong {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 2px;
      }

      .store-detail__product-body p {
        margin: 0 0 4px;
        font-size: 12px;
        color: #6b7280;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .store-detail__product-price {
        font-size: 14px;
        font-weight: 800;
        color: #FF6B00;
      }

      .store-detail__add-btn {
        width: 40px;
        height: 40px;
        border: none;
        border-radius: 50%;
        background: #FF6B00;
        color: #fff;
        font-size: 20px;
        font-weight: 800;
        cursor: pointer;
        display: grid;
        place-items: center;
        transition: transform 0.15s, background 0.15s;
      }

      .store-detail__add-btn:active {
        transform: scale(0.9);
      }

      .store-detail__add-btn.is-added {
        background: #10b981;
      }

      .store-detail__empty {
        text-align: center;
        color: #9ca3af;
        padding: 32px 0;
      }

      .store-detail__cart-btn {
        position: fixed;
        bottom: max(16px, env(safe-area-inset-bottom));
        left: 16px;
        right: 16px;
        padding: 16px;
        border: none;
        border-radius: 16px;
        background: #111827;
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 10;
      }

      .store-detail__cart-btn:active {
        background: #1f2937;
      }
    `}</style>
  );
}

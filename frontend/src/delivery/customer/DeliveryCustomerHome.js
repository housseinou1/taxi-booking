import React from "react";

import { HOME_DELIVERY_CATEGORIES, MORE_DELIVERY_CATEGORIES } from "../deliveryCustomerCategories";

export default function DeliveryCustomerHome({ onSelectCategory }) {
  return (
    <div className="delivery-home">
      {/* Hero banner */}
      <section className="delivery-home__hero">
        <div className="delivery-home__hero-content">
          <span className="delivery-home__hero-badge">Yala Delivery</span>
          <h1 className="delivery-home__hero-title">
            What would you like<br />delivered?
          </h1>
          <p className="delivery-home__hero-sub">
            Food, groceries, pharmacy, parcels — delivered to your door in minutes.
          </p>
        </div>
        <div className="delivery-home__hero-art" aria-hidden="true">
          <span>📦</span>
        </div>
      </section>

      {/* Main categories */}
      <section className="delivery-home__section">
        <div className="delivery-home__section-head">
          <h2>Delivery services</h2>
          <span className="delivery-home__section-count">{HOME_DELIVERY_CATEGORIES.length} services</span>
        </div>
        <div className="delivery-home__grid">
          {HOME_DELIVERY_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className="delivery-home__card"
              onClick={() => onSelectCategory(cat.key)}
            >
              <span className="delivery-home__card-icon">{cat.icon}</span>
              <strong className="delivery-home__card-label">{cat.label}</strong>
              <span className="delivery-home__card-desc">{cat.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* More services */}
      {MORE_DELIVERY_CATEGORIES.length > 0 ? (
        <section className="delivery-home__section">
          <div className="delivery-home__section-head">
            <h2>More services</h2>
          </div>
          <div className="delivery-home__list">
            {MORE_DELIVERY_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                type="button"
                className="delivery-home__list-item"
                onClick={() => onSelectCategory(cat.key)}
              >
                <span className="delivery-home__list-icon">{cat.icon}</span>
                <div className="delivery-home__list-body">
                  <strong>{cat.label}</strong>
                  <span>{cat.description}</span>
                </div>
                <span className="delivery-home__list-arrow" aria-hidden>›</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Promo banner */}
      <section className="delivery-home__promo">
        <div className="delivery-home__promo-content">
          <strong>Free delivery on your first order</strong>
          <span>Use code YALA1 at checkout</span>
        </div>
        <span className="delivery-home__promo-icon" aria-hidden>🎁</span>
      </section>

      <DeliveryHomeStyles />
    </div>
  );
}

function DeliveryHomeStyles() {
  return (
    <style>{`
      .delivery-home {
        display: grid;
        gap: 20px;
        padding-bottom: 24px;
      }

      .delivery-home__hero {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 20px;
        border-radius: 20px;
        background: linear-gradient(135deg, #FF8A3D 0%, #FF6B00 100%);
        color: #fff;
        overflow: hidden;
        position: relative;
      }

      .delivery-home__hero-content {
        flex: 1;
        min-width: 0;
      }

      .delivery-home__hero-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.2);
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 10px;
      }

      .delivery-home__hero-title {
        margin: 0 0 8px;
        font-size: 22px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.02em;
      }

      .delivery-home__hero-sub {
        margin: 0;
        font-size: 13px;
        opacity: 0.9;
        line-height: 1.4;
      }

      .delivery-home__hero-art {
        font-size: 48px;
        opacity: 0.3;
        flex-shrink: 0;
      }

      .delivery-home__section {
        display: grid;
        gap: 12px;
      }

      .delivery-home__section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        padding: 0 4px;
      }

      .delivery-home__section-head h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        color: #111827;
      }

      .delivery-home__section-count {
        font-size: 12px;
        color: #9ca3af;
        font-weight: 600;
      }

      .delivery-home__grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }

      .delivery-home__card {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 6px;
        padding: 18px 8px 14px;
        border: none;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.15s;
      }

      .delivery-home__card:active {
        transform: scale(0.96);
        box-shadow: 0 4px 20px rgba(255,107,0,0.15);
      }

      .delivery-home__card-icon {
        font-size: 32px;
        display: block;
        margin-bottom: 2px;
      }

      .delivery-home__card-label {
        font-size: 13px;
        font-weight: 700;
        color: #111827;
      }

      .delivery-home__card-desc {
        font-size: 10px;
        color: #9ca3af;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .delivery-home__list {
        display: grid;
        gap: 0;
        border-radius: 16px;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        overflow: hidden;
      }

      .delivery-home__list-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border: none;
        background: transparent;
        border-bottom: 1px solid #f3f4f6;
        cursor: pointer;
        text-align: left;
        transition: background 0.1s;
      }

      .delivery-home__list-item:last-child {
        border-bottom: none;
      }

      .delivery-home__list-item:active {
        background: #fff7ed;
      }

      .delivery-home__list-icon {
        font-size: 24px;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: #f9fafb;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }

      .delivery-home__list-body {
        flex: 1;
        min-width: 0;
      }

      .delivery-home__list-body strong {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #111827;
      }

      .delivery-home__list-body span {
        font-size: 12px;
        color: #6b7280;
      }

      .delivery-home__list-arrow {
        font-size: 18px;
        color: #d1d5db;
        font-weight: 700;
      }

      .delivery-home__promo {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-radius: 16px;
        background: linear-gradient(135deg, #fef3c7, #fff7ed);
        border: 1px solid #fde68a;
      }

      .delivery-home__promo-content {
        display: grid;
        gap: 2px;
      }

      .delivery-home__promo-content strong {
        font-size: 14px;
        font-weight: 700;
        color: #92400e;
      }

      .delivery-home__promo-content span {
        font-size: 12px;
        color: #b45309;
      }

      .delivery-home__promo-icon {
        font-size: 28px;
      }

      @media (max-width: 360px) {
        .delivery-home__grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `}</style>
  );
}

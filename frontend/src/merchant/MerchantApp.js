import React, { useCallback, useEffect, useState } from "react";

import { WS_URL } from "../apiConfig";
import {
  ORDER_STATUS_LABELS,
  PRODUCT_CATEGORIES,
  createProduct,
  createPromotion,
  deleteProduct,
  deletePromotion,
  fetchInventory,
  fetchMerchantAnalytics,
  fetchMerchantMe,
  fetchMerchantOrders,
  fetchMerchantPayouts,
  fetchMerchantProducts,
  fetchPromotions,
  merchantLogin,
  merchantOrderAction,
} from "./merchantApi";
import { fetchLegalStatus } from "../legal/legalApi";
import LegalCenter from "../legal/LegalCenter";
import {
  fetchMerchantPayoutHistory,
  fetchMerchantWalletSummary,
  requestMerchantPayout,
} from "../payments/paymentApi";
import "../delivery/delivery-uber.css";
import "../delivery/delivery-customer-dashboard.css";
import MerchantShell from "./MerchantShell";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  { key: "products", label: "Products" },
  { key: "inventory", label: "Inventory" },
  { key: "promotions", label: "Promotions" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

function StatCard({ label, value, sub }) {
  return (
    <div className="merchant-dash__stat">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub ? <small style={{ marginTop: 4, display: "block", fontWeight: 600 }}>{sub}</small> : null}
    </div>
  );
}

const ORDER_PIPELINE = [
  { key: "new_order", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready_for_pickup", label: "Ready" },
];

export default function MerchantApp() {
  const [tab, setTab] = useState("dashboard");
  const [merchant, setMerchant] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payoutSummary, setPayoutSummary] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [productForm, setProductForm] = useState({
    product_name: "",
    description: "",
    category: "General",
    price: "",
    discount_percent: "0",
    stock_quantity: "10",
  });
  const [promoForm, setPromoForm] = useState({
    title: "",
    discount_type: "percentage",
    value: "10",
    promo_code: "",
    expiry_date: "",
  });

  const loadAll = useCallback(async () => {
    try {
      const [me, stats, orderList, productList, promoList, payoutList, walletSummary, withdrawalHistory] = await Promise.all([
        fetchMerchantMe(),
        fetchMerchantAnalytics(),
        fetchMerchantOrders(),
        fetchMerchantProducts(),
        fetchPromotions(),
        fetchMerchantPayouts(),
        fetchMerchantWalletSummary(),
        fetchMerchantPayoutHistory(),
      ]);
      setMerchant(me.merchant || me);
      const legal = await fetchLegalStatus().catch(() => null);
      const merchantLegal = legal?.merchant;
      if (
        merchantLegal
        && (!merchantLegal.signature_complete || merchantLegal.requires_resign)
        && window.location.pathname !== "/merchant/sign"
      ) {
        window.location.href = "/merchant/sign";
        return;
      }
      setAnalytics(stats);
      setOrders(orderList);
      setProducts(productList);
      setPromotions(promoList);
      setPayouts(payoutList);
      setPayoutSummary(walletSummary);
      setPayoutHistory(withdrawalHistory);
      const inv = await fetchInventory();
      setInventory(inv);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("access")) loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!localStorage.getItem("access")) return undefined;
    const wsUrl = WS_URL;
    let socket;
    try {
      socket = new WebSocket(wsUrl);
      socket.onopen = () => socket.send(JSON.stringify({ type: "join_merchant" }));
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (String(data.type || "").startsWith("merchant_")) loadAll();
      };
    } catch (_) {
      // websocket optional
    }
    return () => socket?.close();
  }, [loadAll]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const data = await merchantLogin(loginForm.email, loginForm.password);
      localStorage.setItem("access", data.access);
      localStorage.setItem("refresh", data.refresh);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleOrderAction = async (orderId, action) => {
    try {
      await merchantOrderAction(orderId, action);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateProduct = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(productForm).forEach(([key, value]) => payload.append(key, value));
    try {
      await createProduct(payload);
      setProductForm({
        product_name: "",
        description: "",
        category: "General",
        price: "",
        discount_percent: "0",
        stock_quantity: "10",
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreatePromo = async (event) => {
    event.preventDefault();
    try {
      await createPromotion({
        ...promoForm,
        value: Number(promoForm.value),
        expiry_date: new Date(promoForm.expiry_date).toISOString(),
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!merchant) {
    return (
      <div className="delivery-uber__panel" style={{ maxWidth: 420, margin: "40px auto" }}>
        <h2>Merchant Login</h2>
        {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}
        <form className="delivery-uber__form" onSubmit={handleLogin}>
          <label>Email<input type="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} /></label>
          <label>Password<input type="password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} /></label>
          <button type="submit" className="delivery-uber__primary-btn">Sign in</button>
        </form>
        <button type="button" className="delivery-uber__link-btn" onClick={() => { window.location.href = "/merchant/register"; }}>
          Register as merchant
        </button>
      </div>
    );
  }

  const statusBanner = merchant.status !== "approved"
    ? `Account status: ${merchant.status}${merchant.rejection_reason ? ` — ${merchant.rejection_reason}` : ""}`
    : "";

  const newOrders = orders.filter((order) => order.status === "new_order");

  return (
    <MerchantShell
      merchant={merchant}
      tab={tab}
      tabs={TABS}
      onTabChange={setTab}
      statusBanner={statusBanner}
      error={error}
    >
      {tab === "dashboard" && analytics ? (
        <>
          <div className="merchant-dash__stat-grid">
            <StatCard label="New orders" value={newOrders.length} />
            <StatCard label="Active orders" value={analytics.active_orders} />
            <StatCard label="Revenue" value={`${analytics.revenue} MRU`} />
            <StatCard label="Cancelled" value={analytics.cancelled_orders} />
            <StatCard
              label="Daily sales"
              value={analytics.daily_sales.count}
              sub={`${analytics.daily_sales.revenue} MRU`}
            />
            <StatCard
              label="Weekly sales"
              value={analytics.weekly_sales.count}
              sub={`${analytics.weekly_sales.revenue} MRU`}
            />
          </div>
          {newOrders.length > 0 ? (
            <section>
              <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Needs action</h3>
              {newOrders.slice(0, 3).map((order) => (
                <article key={order.id} className="merchant-dash__order-card">
                  <div className="merchant-dash__order-head">
                    <strong>Order #{order.id}</strong>
                    <span className="merchant-dash__order-status">New</span>
                  </div>
                  <small>
                    {order.customer_name} · {order.total} MRU
                  </small>
                  <div className="merchant-dash__order-actions">
                    <button
                      type="button"
                      className="merchant-dash__btn merchant-dash__btn--primary"
                      onClick={() => handleOrderAction(order.id, "accept")}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="merchant-dash__btn merchant-dash__btn--ghost"
                      onClick={() => handleOrderAction(order.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === "orders" ? (
        <>
          <div className="merchant-dash__pipeline">
            {ORDER_PIPELINE.map((step) => (
              <div
                key={step.key}
                className={`merchant-dash__pipeline-step ${
                  orders.some((order) => order.status === step.key) ? "is-active" : ""
                }`}
              >
                {step.label}
              </div>
            ))}
          </div>
          {orders.length === 0 ? (
            <p className="delivery-uber__empty">No orders yet.</p>
          ) : (
            orders.map((order) => (
              <article key={order.id} className="merchant-dash__order-card">
                <div className="merchant-dash__order-head">
                  <strong>Order #{order.id}</strong>
                  <span className="merchant-dash__order-status">
                    {ORDER_STATUS_LABELS[order.status] || order.status}
                  </span>
                </div>
                <small>
                  {order.customer_name} · {order.recipient_phone}
                </small>
                <p style={{ margin: "8px 0", fontWeight: 700 }}>{order.total} MRU</p>
                <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                  {order.items?.map((item) => (
                    <li key={item.id}>
                      {item.product_name} × {item.quantity}
                    </li>
                  ))}
                </ul>
                <div className="merchant-dash__order-actions">
                  {order.status === "new_order" ? (
                    <>
                      <button
                        type="button"
                        className="merchant-dash__btn merchant-dash__btn--primary"
                        onClick={() => handleOrderAction(order.id, "accept")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="merchant-dash__btn merchant-dash__btn--ghost"
                        onClick={() => handleOrderAction(order.id, "reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {order.status === "accepted" ? (
                    <button
                      type="button"
                      className="merchant-dash__btn merchant-dash__btn--primary"
                      onClick={() => handleOrderAction(order.id, "preparing")}
                    >
                      Mark preparing
                    </button>
                  ) : null}
                  {["accepted", "preparing"].includes(order.status) ? (
                    <button
                      type="button"
                      className="merchant-dash__btn merchant-dash__btn--primary"
                      onClick={() => handleOrderAction(order.id, "ready")}
                    >
                      Ready for pickup
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </>
      ) : null}

      {tab === "products" ? (
        <div>
          <form className="delivery-uber__form delivery-uber__panel" onSubmit={handleCreateProduct}>
            <h3>Add product</h3>
            <label>Name<input required value={productForm.product_name} onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })} /></label>
            <label>Description<textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></label>
            <label>
              Category
              <select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                {[...(PRODUCT_CATEGORIES[merchant.business_type] || PRODUCT_CATEGORIES.default)].map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label>Price<input required type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></label>
            <label>Discount %<input type="number" value={productForm.discount_percent} onChange={(e) => setProductForm({ ...productForm, discount_percent: e.target.value })} /></label>
            <label>Stock<input type="number" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} /></label>
            <button type="submit" className="delivery-uber__primary-btn">Add product</button>
          </form>
          <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
            {products.map((product) => (
              <div key={product.id} className="delivery-uber__list-item">
                <strong>{product.product_name}</strong> — {product.effective_price || product.price} MRU
                <small> {product.category} · {product.stock_status}</small>
                <button type="button" className="delivery-uber__link-btn" onClick={() => deleteProduct(product.id).then(loadAll)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="delivery-uber__panel">
          {["in_stock", "low_stock", "out_of_stock"].map((status) => (
            <section key={status} style={{ marginBottom: 16 }}>
              <h3>{status.replace(/_/g, " ")}</h3>
              {inventory.filter((p) => p.stock_status === status).map((product) => (
                <div key={product.id} className="delivery-uber__list-item">
                  {product.product_name} — qty {product.stock_quantity}
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {tab === "promotions" ? (
        <div>
          <form className="delivery-uber__form delivery-uber__panel" onSubmit={handleCreatePromo}>
            <h3>Create promotion</h3>
            <label>Title<input required value={promoForm.title} onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })} /></label>
            <label>
              Type
              <select value={promoForm.discount_type} onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value })}>
                <option value="percentage">Discount %</option>
                <option value="bogo">Buy 1 Get 1</option>
                <option value="free_delivery">Free delivery</option>
                <option value="promo_code">Promo code</option>
              </select>
            </label>
            <label>Value<input type="number" value={promoForm.value} onChange={(e) => setPromoForm({ ...promoForm, value: e.target.value })} /></label>
            <label>Promo code<input value={promoForm.promo_code} onChange={(e) => setPromoForm({ ...promoForm, promo_code: e.target.value })} /></label>
            <label>Expiry<input required type="datetime-local" value={promoForm.expiry_date} onChange={(e) => setPromoForm({ ...promoForm, expiry_date: e.target.value })} /></label>
            <button type="submit" className="delivery-uber__primary-btn">Create</button>
          </form>
          <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
            {promotions.map((promo) => (
              <div key={promo.id} className="delivery-uber__list-item">
                <strong>{promo.title}</strong> — {promo.discount_type}
                <button type="button" className="delivery-uber__link-btn" onClick={() => deletePromotion(promo.id).then(loadAll)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "reports" ? (
        <div>
          {payoutSummary ? (
            <div className="merchant-dash__stat-grid" style={{ marginBottom: 16 }}>
              <StatCard label="Total sales" value={`${payoutSummary.total_sales} MRU`} />
              <StatCard label="Yala commission" value={`${payoutSummary.yala_commission} MRU`} />
              <StatCard label="Net earnings" value={`${payoutSummary.net_earnings} MRU`} />
              <StatCard label="Available payout" value={`${payoutSummary.available_payout} MRU`} />
              <StatCard label="Pending payout" value={`${payoutSummary.pending_payout} MRU`} />
              <StatCard label="Paid out" value={`${payoutSummary.paid_payout} MRU`} />
            </div>
          ) : null}
          <form
            className="delivery-uber__form delivery-uber__panel"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await requestMerchantPayout(Number(payoutAmount));
                setPayoutAmount("");
                await loadAll();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            <h3>Request payout</h3>
            <label>
              Amount (MRU)
              <input type="number" min="1" required value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
            </label>
            <button type="submit" className="delivery-uber__primary-btn">Request payout</button>
          </form>
          <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
            <h3>Payout history</h3>
            {payoutHistory.length === 0 ? <p>No payout requests yet.</p> : payoutHistory.map((payout) => (
              <div key={payout.id} className="delivery-uber__list-item">
                {payout.amount} MRU — {payout.status}
              </div>
            ))}
          </div>
          <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
            <h3>Legacy payout records</h3>
            {payouts.length === 0 ? <p>No payouts yet.</p> : payouts.map((payout) => (
              <div key={payout.id} className="delivery-uber__list-item">
                {payout.amount} MRU — {payout.status} ({payout.period_start} to {payout.period_end})
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="delivery-uber__panel">
          <p><strong>Owner:</strong> {merchant.owner_name}</p>
          <p><strong>Phone:</strong> {merchant.phone_number}</p>
          <p><strong>Address:</strong> {merchant.address}</p>
          <p><strong>Payout:</strong> {merchant.payout_method}</p>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="delivery-uber__btn"
              onClick={() => {
                window.location.href = "/merchant/sign";
              }}
            >
              View / re-sign merchant agreement
            </button>
          </div>
          <LegalCenter app="delivery" />
        </div>
      ) : null}
    </MerchantShell>
  );
}

import React, { useCallback, useEffect, useState } from "react";

import { WS_URL } from "../apiConfig";
import {
  ORDER_STATUS_LABELS,
  PRODUCT_CATEGORIES,
  WEEKDAYS,
  createMenuCategory,
  createProduct,
  createPromotion,
  deleteMenuCategory,
  deleteProduct,
  deletePromotion,
  fetchInventory,
  fetchMenuCategories,
  fetchMerchantAnalytics,
  fetchMerchantMe,
  fetchMerchantOrders,
  fetchMerchantPayouts,
  fetchMerchantProducts,
  fetchMerchantSettlements,
  fetchPromotions,
  merchantLogin,
  merchantOrderAction,
  updateMerchantSettings,
  updateProduct,
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
  { key: "courier_assigned", label: "Courier" },
  { key: "picked_up", label: "Picked up" },
  { key: "delivered", label: "Delivered" },
];

const DEFAULT_HOURS = WEEKDAYS.reduce((acc, day) => {
  acc[day] = { open: "08:00", close: "22:00", closed: false };
  return acc;
}, {});

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
  const [settlements, setSettlements] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [settingsForm, setSettingsForm] = useState({
    delivery_radius_km: "8",
    estimated_prep_minutes: "25",
    opening_hours: DEFAULT_HOURS,
  });
  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductForm, setEditProductForm] = useState(null);
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
      const [me, stats, orderList, productList, promoList, payoutList, walletSummary, withdrawalHistory, settlementList, categories] = await Promise.all([
        fetchMerchantMe(),
        fetchMerchantAnalytics(),
        fetchMerchantOrders(),
        fetchMerchantProducts(),
        fetchPromotions(),
        fetchMerchantPayouts(),
        fetchMerchantWalletSummary(),
        fetchMerchantPayoutHistory(),
        fetchMerchantSettlements().catch(() => []),
        fetchMenuCategories().catch(() => []),
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
      setSettlements(settlementList);
      setMenuCategories(categories);
      const profile = me.merchant || me;
      setSettingsForm({
        delivery_radius_km: String(profile.delivery_radius_km ?? 8),
        estimated_prep_minutes: String(profile.estimated_prep_minutes ?? 25),
        opening_hours: { ...DEFAULT_HOURS, ...(profile.opening_hours || {}) },
      });
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

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    try {
      await updateMerchantSettings({
        delivery_radius_km: Number(settingsForm.delivery_radius_km),
        estimated_prep_minutes: Number(settingsForm.estimated_prep_minutes),
        opening_hours: settingsForm.opening_hours,
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    try {
      await createMenuCategory(categoryForm);
      setCategoryForm({ name: "", description: "" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveProductEdit = async (event) => {
    event.preventDefault();
    if (!editingProductId || !editProductForm) return;
    const payload = new FormData();
    Object.entries(editProductForm).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) payload.append(key, value);
    });
    try {
      await updateProduct(editingProductId, payload);
      setEditingProductId(null);
      setEditProductForm(null);
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
            <StatCard label="Today's orders" value={analytics.today_orders ?? analytics.daily_sales?.count ?? 0} />
            <StatCard label="New orders" value={newOrders.length} />
            <StatCard label="Active orders" value={analytics.active_orders} />
            <StatCard label="Revenue" value={`${analytics.revenue} MRU`} />
            <StatCard
              label="Avg prep time"
              value={analytics.avg_preparation_minutes != null ? `${analytics.avg_preparation_minutes} min` : "—"}
            />
            <StatCard
              label="Cancellation rate"
              value={analytics.cancellation_rate != null ? `${analytics.cancellation_rate}%` : "—"}
            />
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
          {analytics.best_selling_items?.length ? (
            <section style={{ marginTop: 16 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>Best sellers</h3>
              {analytics.best_selling_items.slice(0, 5).map((item) => (
                <div key={item.product_name} className="delivery-uber__list-item">
                  {item.product_name} — {item.quantity_sold} sold
                </div>
              ))}
            </section>
          ) : null}
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
          <form className="delivery-uber__form delivery-uber__panel" onSubmit={handleCreateCategory} style={{ marginBottom: 16 }}>
            <h3>Menu categories</h3>
            <label>Name<input required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} /></label>
            <label>Description<textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} /></label>
            <button type="submit" className="delivery-uber__primary-btn">Add category</button>
          </form>
          {menuCategories.length ? (
            <div className="delivery-uber__panel" style={{ marginBottom: 16 }}>
              {menuCategories.map((cat) => (
                <div key={cat.id} className="delivery-uber__list-item">
                  <strong>{cat.name}</strong>
                  {cat.description ? <small> — {cat.description}</small> : null}
                  <button type="button" className="delivery-uber__link-btn" onClick={() => deleteMenuCategory(cat.id).then(loadAll)}>Delete</button>
                </div>
              ))}
            </div>
          ) : null}
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
                <small> {product.category} · {product.stock_status}{product.requires_prescription ? " · Rx" : ""}</small>
                <button
                  type="button"
                  className="delivery-uber__link-btn"
                  onClick={() => {
                    setEditingProductId(product.id);
                    setEditProductForm({
                      product_name: product.product_name,
                      description: product.description || "",
                      category: product.category,
                      price: String(product.price),
                      discount_percent: String(product.discount_percent || 0),
                      stock_quantity: String(product.stock_quantity),
                      requires_prescription: product.requires_prescription ? "true" : "false",
                      is_available: product.is_available ? "true" : "false",
                    });
                  }}
                >
                  Edit
                </button>
                <button type="button" className="delivery-uber__link-btn" onClick={() => deleteProduct(product.id).then(loadAll)}>Delete</button>
              </div>
            ))}
          </div>
          {editingProductId && editProductForm ? (
            <form className="delivery-uber__form delivery-uber__panel" style={{ marginTop: 16 }} onSubmit={handleSaveProductEdit}>
              <h3>Edit product #{editingProductId}</h3>
              <label>Name<input required value={editProductForm.product_name} onChange={(e) => setEditProductForm({ ...editProductForm, product_name: e.target.value })} /></label>
              <label>Description<textarea value={editProductForm.description} onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })} /></label>
              <label>Price<input required type="number" step="0.01" value={editProductForm.price} onChange={(e) => setEditProductForm({ ...editProductForm, price: e.target.value })} /></label>
              <label>Stock<input type="number" value={editProductForm.stock_quantity} onChange={(e) => setEditProductForm({ ...editProductForm, stock_quantity: e.target.value })} /></label>
              {merchant.business_type === "pharmacy" ? (
                <label>
                  Prescription required
                  <select value={editProductForm.requires_prescription} onChange={(e) => setEditProductForm({ ...editProductForm, requires_prescription: e.target.value })}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="delivery-uber__primary-btn">Save</button>
                <button type="button" className="delivery-uber__link-btn" onClick={() => { setEditingProductId(null); setEditProductForm(null); }}>Cancel</button>
              </div>
            </form>
          ) : null}
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
            <h3>Weekly settlements</h3>
            {settlements.length === 0 ? <p>No settlements yet.</p> : settlements.map((settlement) => (
              <div key={settlement.id} className="delivery-uber__list-item">
                {settlement.invoice_reference || `Settlement #${settlement.id}`} — {settlement.net_payout} MRU ({settlement.status})
                <small> {settlement.period_start} → {settlement.period_end}</small>
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
        <div>
          <form className="delivery-uber__form delivery-uber__panel" onSubmit={handleSaveSettings}>
            <h3>Store configuration</h3>
            <label>
              Delivery radius (km)
              <input
                type="number"
                min="1"
                step="0.5"
                required
                value={settingsForm.delivery_radius_km}
                onChange={(e) => setSettingsForm({ ...settingsForm, delivery_radius_km: e.target.value })}
              />
            </label>
            <label>
              Preparation time (minutes)
              <input
                type="number"
                min="5"
                required
                value={settingsForm.estimated_prep_minutes}
                onChange={(e) => setSettingsForm({ ...settingsForm, estimated_prep_minutes: e.target.value })}
              />
            </label>
            <h4 style={{ margin: "12px 0 8px" }}>Opening hours</h4>
            {WEEKDAYS.map((day) => (
              <div key={day} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <strong style={{ textTransform: "capitalize" }}>{day}</strong>
                <input
                  type="time"
                  disabled={settingsForm.opening_hours[day]?.closed}
                  value={settingsForm.opening_hours[day]?.open || "08:00"}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    opening_hours: {
                      ...settingsForm.opening_hours,
                      [day]: { ...settingsForm.opening_hours[day], open: e.target.value },
                    },
                  })}
                />
                <input
                  type="time"
                  disabled={settingsForm.opening_hours[day]?.closed}
                  value={settingsForm.opening_hours[day]?.close || "22:00"}
                  onChange={(e) => setSettingsForm({
                    ...settingsForm,
                    opening_hours: {
                      ...settingsForm.opening_hours,
                      [day]: { ...settingsForm.opening_hours[day], close: e.target.value },
                    },
                  })}
                />
                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.opening_hours[day]?.closed)}
                    onChange={(e) => setSettingsForm({
                      ...settingsForm,
                      opening_hours: {
                        ...settingsForm.opening_hours,
                        [day]: { ...settingsForm.opening_hours[day], closed: e.target.checked },
                      },
                    })}
                  />
                  Closed
                </label>
              </div>
            ))}
            <button type="submit" className="delivery-uber__primary-btn">Save settings</button>
          </form>
          <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
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
        </div>
      ) : null}
    </MerchantShell>
  );
}

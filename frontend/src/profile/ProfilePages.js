import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { API_URL } from "../apiConfig";
import { MARKET, formatMoney } from "../marketConfig";

const authConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  },
});

function RiderProfilePage() {
  return <ProfilePage role="rider" />;
}

function DriverProfilePage() {
  return <ProfilePage role="driver" />;
}

function ProfilePage({ role }) {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [driver, setDriver] = useState(null);
  const [rides, setRides] = useState([]);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const isDriver = role === "driver";

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setMessage("");

        const requests = [
          axios.get(`${API_URL}/auth/me/`, authConfig()),
          axios.get(`${API_URL}/rides/history/`, authConfig()),
          axios.get(
            `${API_URL}/payments/${isDriver ? "payout-methods" : "methods"}/`,
            authConfig()
          ),
        ];

        if (isDriver) {
          requests.push(axios.get(`${API_URL}/drivers/me/`, authConfig()));
        }

        const [userResponse, ridesResponse, methodsResponse, driverResponse] =
          await Promise.all(requests);

        if (!isMounted) return;

        setUser(userResponse.data);
        setRides(Array.isArray(ridesResponse.data) ? ridesResponse.data : []);
        setMethods(Array.isArray(methodsResponse.data) ? methodsResponse.data : []);
        setDriver(driverResponse?.data || null);
      } catch (error) {
        console.log("Profile page error:", error.response?.data || error);
        if (isMounted) {
          setMessage(
              error.response?.data?.detail ||
              error.response?.data?.error ||
              t("profile.loadError")
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [isDriver, t]);

  const completedTrips = useMemo(
    () => rides.filter((ride) => ride.status === "completed"),
    [rides]
  );

  const rating = useMemo(() => {
    const key = isDriver ? "rating" : "driver_rating";
    const values = completedTrips
      .map((ride) => Number(ride[key] || 0))
      .filter((value) => value > 0);

    if (!values.length) {
      return isDriver
        ? Number(driver?.average_rating || user?.driver_average_rating || 0)
        : Number(user?.rider_average_rating || 0);
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [completedTrips, driver, isDriver, user]);

  const profile = isDriver ? driver || user : user;
  const name =
    profile?.driver_name ||
    profile?.full_name ||
    `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
    profile?.email ||
    (isDriver ? t("common.driver") : t("common.rider"));
  const email = profile?.driver_email || profile?.email || t("profile.noEmail");
  const phone = profile?.phone_number || t("profile.noPhone");
  const photo = isDriver ? profile?.driver_photo : profile?.profile_picture;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleLabel = isDriver ? t("profile.driverProfile") : t("profile.riderProfile");
  const status = isDriver ? profile?.status || "pending" : user?.rider_status || "pending";
  const totalSpent = completedTrips.reduce(
    (sum, ride) => sum + Number(isDriver ? ride.driver_earning || ride.fare || 0 : ride.fare || 0),
    0
  );

  return (
    <main className="sx-profile-page">
      <ProfileStyles />

      <header className="sx-profile-nav">
        <button type="button" onClick={() => (window.location.href = "/")}>
          {MARKET.brandName}
        </button>
        <div>
          <button type="button" onClick={() => (window.location.href = "/rider-profile")}>
            {t("profile.riderProfile")}
          </button>
          <button type="button" onClick={() => (window.location.href = "/driver-profile")}>
            {t("profile.driverProfile")}
          </button>
          <button type="button" onClick={() => (window.location.href = "/settings")}>
            {t("common.settings")}
          </button>
        </div>
      </header>

      {loading ? (
        <section className="sx-profile-loading">{t("profile.loading")}</section>
      ) : message ? (
        <section className="sx-profile-loading">{message}</section>
      ) : (
        <>
          <section className="sx-profile-hero">
            <div className="sx-profile-person">
              <div className="sx-profile-photo">
                {photo ? <img src={photo} alt={name} /> : <span>{initials || "SX"}</span>}
              </div>
              <div>
                <span className="sx-profile-kicker">{roleLabel}</span>
                <h1>{name}</h1>
                <p>{email}</p>
                <div className="sx-profile-badges">
                  <span>{status}</span>
                  {isDriver && driver?.status === "approved" && <span>{t("profile.verifiedDriver")}</span>}
                  {!isDriver && user?.rider_status === "approved" && <span>{t("profile.approvedRider")}</span>}
                </div>
              </div>
            </div>

            <div className="sx-profile-contact">
              <InfoTile label={t("profile.phone")} value={phone} />
              <InfoTile
                label={t("profile.rating")}
                value={rating > 0 ? t("profile.stars", { rating: rating.toFixed(1) }) : t("profile.noRatings")}
              />
              <InfoTile label={t("profile.trips")} value={completedTrips.length} />
            </div>
          </section>

          <section className="sx-profile-grid">
            <ProfilePanel title={t("profile.accountDetails")} eyebrow={t("profile.profile")}>
              <div className="sx-info-list">
                <InfoRow label={t("profile.email")} value={email} />
                <InfoRow label={t("profile.phoneNumber")} value={phone} />
                <InfoRow
                  label={t("profile.memberSince")}
                  value={profile?.member_since_year || user?.member_since_year || t("profile.na")}
                />
                <InfoRow
                  label={t("profile.yearsUsingApp")}
                  value={profile?.years_using_app ?? user?.years_using_app ?? "0"}
                />
                {isDriver && (
                  <>
                    <InfoRow
                      label={t("profile.vehicle")}
                      value={
                        [driver?.vehicle_color, driver?.vehicle_make, driver?.vehicle_model]
                          .filter(Boolean)
                          .join(" ") || t("profile.notAdded")
                      }
                    />
                    <InfoRow label={t("profile.plateNumber")} value={driver?.plate_number || t("profile.notAdded")} />
                  </>
                )}
              </div>
            </ProfilePanel>

            <ProfilePanel
              title={isDriver ? t("profile.payoutMethods") : t("profile.savedPaymentMethods")}
              eyebrow={t("profile.payments")}
              actionLabel={isDriver ? t("profile.managePayouts") : t("profile.managePayments")}
              onAction={() =>
                (window.location.href = isDriver ? "/driver" : "/payment-setup")
              }
            >
              <PaymentMethodList methods={methods} isDriver={isDriver} />
            </ProfilePanel>

            <ProfilePanel title={t("profile.tripHistory")} eyebrow={t("profile.activity")}>
              <div className="sx-trip-summary">
                <InfoTile
                  label={isDriver ? t("profile.driverEarnings") : t("profile.totalFares")}
                  value={formatMoney(totalSpent)}
                />
                <InfoTile label={t("profile.completed")} value={completedTrips.length} />
              </div>
              <TripHistoryList rides={rides} isDriver={isDriver} t={t} />
            </ProfilePanel>

            <ProfilePanel title={t("profile.accountSettings")} eyebrow={t("profile.controls")}>
              <div className="sx-settings-list">
                <button type="button" onClick={() => (window.location.href = "/settings")}>
                  {t("profile.profileLanguageSettings")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    (window.location.href = isDriver ? "/driver-vehicle-setup" : "/rider-dashboard")
                  }
                >
                  {isDriver ? t("profile.driverDocumentsVehicle") : t("profile.riderPhotoPhone")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    (window.location.href = isDriver ? "/driver" : "/rider-payments")
                  }
                >
                  {isDriver ? t("profile.driverDashboard") : t("profile.receiptsPayments")}
                </button>
                <button type="button" onClick={() => (window.location.href = "/support")}>
                  {t("profile.helpSupport")}
                </button>
              </div>
            </ProfilePanel>
          </section>
        </>
      )}
    </main>
  );
}

function ProfilePanel({ title, eyebrow, children, actionLabel, onAction }) {
  return (
    <article className="sx-profile-panel">
      <div className="sx-panel-head">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {actionLabel && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </article>
  );
}

function InfoTile({ label, value }) {
  return (
    <div className="sx-info-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="sx-info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PaymentMethodList({ methods, isDriver }) {
  const { t } = useTranslation();

  if (!methods.length) {
    return (
      <div className="sx-empty-state">
        <strong>{isDriver ? t("profile.noPayoutMethods") : t("profile.noPaymentMethods")}</strong>
        <p>
          {isDriver
            ? t("profile.addPayoutMethod")
            : t("profile.addPaymentMethod")}
        </p>
      </div>
    );
  }

  return (
    <div className="sx-method-list">
      {methods.slice(0, 4).map((method) => (
        <div key={method.id} className="sx-method-row">
          <div>
            <strong>{method.display_name || method.payment_type || method.payout_type}</strong>
            <span>{describeMethod(method)}</span>
          </div>
          {method.is_default && <em>{t("profile.default")}</em>}
        </div>
      ))}
    </div>
  );
}

function TripHistoryList({ rides, isDriver, t }) {
  if (!rides.length) {
    return (
      <div className="sx-empty-state">
        <strong>{t("profile.noTrips")}</strong>
        <p>{t("profile.noTripsDescription")}</p>
      </div>
    );
  }

  return (
    <div className="sx-trip-list">
      {rides.slice(0, 6).map((ride) => (
        <div key={ride.id} className="sx-trip-row">
          <div>
            <strong>{ride.pickup_address || ride.pickup || t("profile.pickup")}</strong>
            <span>{ride.destination_address || ride.destination || t("profile.destination")}</span>
          </div>
          <div>
            <strong>{formatMoney(isDriver ? ride.driver_earning || ride.fare : ride.fare)}</strong>
            <span>{ride.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function describeMethod(method) {
  if (method.card_last4) return `Card ending ${method.card_last4}`;
  if (method.phone_number) return method.phone_number;
  if (method.wallet_id) return method.wallet_id;
  if (method.account_reference) return method.account_reference;
  if (method.bank_name) return method.bank_name;
  return "Saved on account";
}

function ProfileStyles() {
  return (
    <style>{`
      .sx-profile-page {
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(250, 204, 21, 0.14), transparent 30%),
          linear-gradient(135deg, #05070d 0%, #111827 52%, #05070d 100%);
        color: #f8fafc;
        font-family: Inter, Arial, sans-serif;
        padding: 22px;
      }

      .sx-profile-nav {
        max-width: 1180px;
        margin: 0 auto 22px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
      }

      .sx-profile-nav button,
      .sx-panel-head button,
      .sx-settings-list button {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        color: #f8fafc;
        padding: 10px 14px;
        font-weight: 900;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease;
      }

      .sx-profile-nav button:hover,
      .sx-panel-head button:hover,
      .sx-settings-list button:hover {
        transform: translateY(-1px);
        background: rgba(250, 204, 21, 0.16);
      }

      .sx-profile-nav > button {
        background: #facc15;
        color: #111827;
      }

      .sx-profile-nav div {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .sx-profile-loading,
      .sx-profile-hero,
      .sx-profile-grid {
        max-width: 1180px;
        margin: 0 auto;
      }

      .sx-profile-loading {
        min-height: 280px;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        background: rgba(255,255,255,0.06);
        font-weight: 900;
      }

      .sx-profile-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
        gap: 16px;
        align-items: stretch;
      }

      .sx-profile-person,
      .sx-profile-contact,
      .sx-profile-panel {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        background: rgba(255,255,255,0.07);
        box-shadow: 0 24px 70px rgba(0,0,0,0.28);
      }

      .sx-profile-person {
        min-height: 230px;
        padding: 24px;
        display: grid;
        grid-template-columns: 132px minmax(0, 1fr);
        gap: 20px;
        align-items: center;
      }

      .sx-profile-photo {
        width: 132px;
        height: 132px;
        border-radius: 32px;
        overflow: hidden;
        background: #111827;
        border: 3px solid rgba(250, 204, 21, 0.7);
        display: grid;
        place-items: center;
      }

      .sx-profile-photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .sx-profile-photo span {
        font-size: 2rem;
        font-weight: 950;
      }

      .sx-profile-kicker,
      .sx-panel-head span,
      .sx-info-tile span,
      .sx-info-row span {
        color: #facc15;
        font-size: 0.74rem;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .sx-profile-person h1 {
        margin: 8px 0 8px;
        font-size: clamp(2rem, 5vw, 4rem);
        line-height: 0.98;
        letter-spacing: 0;
      }

      .sx-profile-person p {
        margin: 0;
        color: #cbd5e1;
        font-weight: 800;
        overflow-wrap: anywhere;
      }

      .sx-profile-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 16px;
      }

      .sx-profile-badges span,
      .sx-method-row em {
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.16);
        color: #86efac;
        border: 1px solid rgba(34, 197, 94, 0.24);
        padding: 7px 10px;
        font-size: 0.76rem;
        font-weight: 950;
        text-transform: capitalize;
      }

      .sx-profile-contact {
        padding: 18px;
        display: grid;
        gap: 12px;
      }

      .sx-profile-grid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }

      .sx-profile-panel {
        padding: 18px;
        min-width: 0;
      }

      .sx-panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 16px;
      }

      .sx-panel-head h2 {
        margin: 6px 0 0;
        font-size: 1.35rem;
        letter-spacing: 0;
      }

      .sx-info-list,
      .sx-method-list,
      .sx-trip-list,
      .sx-settings-list {
        display: grid;
        gap: 10px;
      }

      .sx-info-row,
      .sx-method-row,
      .sx-trip-row,
      .sx-empty-state,
      .sx-info-tile {
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        background: rgba(5, 7, 13, 0.5);
        padding: 13px;
      }

      .sx-info-row,
      .sx-method-row,
      .sx-trip-row {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: center;
      }

      .sx-info-row strong,
      .sx-info-tile strong,
      .sx-method-row strong,
      .sx-trip-row strong {
        color: #f8fafc;
        overflow-wrap: anywhere;
      }

      .sx-method-row span,
      .sx-trip-row span,
      .sx-empty-state p {
        display: block;
        color: #cbd5e1;
        margin-top: 5px;
        font-size: 0.9rem;
        font-weight: 750;
      }

      .sx-trip-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .sx-trip-row div:last-child {
        text-align: right;
      }

      .sx-settings-list button {
        width: 100%;
        border-radius: 12px;
        text-align: left;
      }

      @media (max-width: 820px) {
        .sx-profile-page {
          padding: 14px;
        }

        .sx-profile-hero,
        .sx-profile-grid {
          grid-template-columns: 1fr;
        }

        .sx-profile-person {
          grid-template-columns: 1fr;
          justify-items: start;
        }

        .sx-profile-photo {
          width: 112px;
          height: 112px;
          border-radius: 26px;
        }

        .sx-info-row,
        .sx-method-row,
        .sx-trip-row {
          align-items: flex-start;
          flex-direction: column;
        }

        .sx-trip-row div:last-child {
          text-align: left;
        }
      }
    `}</style>
  );
}

export { DriverProfilePage, RiderProfilePage };

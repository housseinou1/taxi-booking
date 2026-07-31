import React, { useMemo, useRef, useState } from "react";
import {
  Avatar,
  Kpi,
  EarningsCard,
  PrimaryButton,
  SecondaryButton,
  OnlineStatus,
  QuickActionTile,
  Icon,
  IconButton,
  Section,
  ScreenContainer,
} from "../../design-system";
import {
  DriverLoadingState,
  DriverErrorState,
} from "../ui/DriverAppStates";
import { formatMoney } from "../../marketConfig";
import { navigateInApp } from "../../navigation/inAppNavigation";
import "./DriverDashboardContent.css";

function getDriverName(driverProfile) {
  const first =
    driverProfile?.user?.first_name ||
    driverProfile?.first_name ||
    "";
  const last =
    driverProfile?.user?.last_name ||
    driverProfile?.last_name ||
    "";
  return `${first} ${last}`.trim() || "Driver";
}

function getDocumentAlertProps(documentsAlertLevel, driverProfile) {
  if (!documentsAlertLevel) return null;
  if (documentsAlertLevel === "error" || documentsAlertLevel === "danger") {
    return {
      message: "A required document is expired or rejected. Upload a renewed document before going online.",
      intent: "danger",
    };
  }
  const soon = driverProfile?.expiring_soon_documents?.[0];
  const days = soon?.days_remaining;
  if (days !== undefined && days !== null) {
    return {
      message: `A required document expires in ${days} day${days === 1 ? "" : "s"}. Renew it soon.`,
      intent: "warning",
    };
  }
  return {
    message: "A required document needs attention. Review your documents.",
    intent: "warning",
  };
}

export default function DriverDashboardContent({
  driverProfile,
  isOnline,
  toggleLoading,
  toggleError,
  documentsBlockOnline,
  documentsAlert,
  documentsAlertLevel,
  todayTripsCount,
  todayEarnings,
  acceptanceRate,
  missedRides,
  driverPerformance,
  earningsByPeriod,
  recentRides,
  onToggleAvailability,
  onOpenMenu,
  loading,
  error,
  onRetry,
}) {
  const name = useMemo(() => getDriverName(driverProfile), [driverProfile]);
  const photoUrl = driverProfile?.driver_photo || driverProfile?.profile_picture || "";

  const initials = useMemo(() => {
    return String(name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [name]);

  const rating = Number(
    driverPerformance?.average_rating ||
      driverProfile?.average_rating ||
      driverProfile?.rating ||
      0
  );
  const completion = Number(driverPerformance?.completion_rate ?? 0);
  const onlineHours = Number(
    driverPerformance?.online_hours_today || driverProfile?.online_hours_today || 0
  );
  const driverScore = Number(
    driverPerformance?.driver_score || driverProfile?.driver_score || 0
  );
  const driverScoreLabel =
    driverPerformance?.driver_score_label ||
    driverProfile?.driver_score_label ||
    "";

  const documentAlert = useMemo(
    () => getDocumentAlertProps(documentsAlertLevel, driverProfile),
    [documentsAlertLevel, driverProfile]
  );

  const todayEarningsFormatted = formatMoney(todayEarnings ?? 0);
  const weeklyEarnings = earningsByPeriod?.week ?? 0;
  const weeklyEarningsFormatted = formatMoney(weeklyEarnings);

  const recentTrips = useMemo(() => {
    const trips = Array.isArray(recentRides)
      ? recentRides.filter((r) => r.status === "completed").slice(0, 3)
      : [];
    return trips;
  }, [recentRides]);

  const [sheetExpanded, setSheetExpanded] = useState(false);
  const dragStartY = useRef(null);
  const dragStartExpanded = useRef(false);

  const toggleSheet = () => setSheetExpanded((v) => !v);

  const handlePointerDown = (e) => {
    dragStartY.current = e.clientY ?? e.touches?.[0]?.clientY;
    dragStartExpanded.current = sheetExpanded;
  };

  const handlePointerMove = (e) => {
    if (dragStartY.current == null) return;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    const delta = dragStartY.current - clientY;
    if (Math.abs(delta) > 48) {
      setSheetExpanded(dragStartExpanded.current ? delta < 0 : delta > 0);
    }
  };

  const handlePointerUp = () => {
    dragStartY.current = null;
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleSheet();
    }
  };

  if (loading) {
    return (
      <ScreenContainer className="driver-dashboard-content driver-dashboard-content--loading">
        <DriverLoadingState title="Loading dashboard" />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer className="driver-dashboard-content driver-dashboard-content--error">
        <DriverErrorState
          title="Unable to load dashboard"
          message={error}
          actionLabel={onRetry ? "Try again" : ""}
          onAction={onRetry}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="driver-dashboard-content">
      <div className="driver-dashboard-content__shell">
        <header className="driver-dashboard-content__topbar" aria-label="Driver top bar">
          <div className="driver-dashboard-content__topbar-main">
            <Avatar
              src={photoUrl}
              alt={name || "Driver"}
              initials={initials || "?"}
              size="md"
              className="driver-dashboard-content__topbar-avatar"
            />
            <span className="driver-dashboard-content__topbar-name">{name}</span>
          </div>
          <div className="driver-dashboard-content__topbar-actions">
            <IconButton
              aria-label="Open notifications"
              icon={<Icon name="notifications" size="md" />}
              onClick={() => navigateInApp("/driver/notifications")}
            />
            <IconButton
              aria-label="Open menu"
              icon={<Icon name="settings" size="md" />}
              onClick={onOpenMenu}
            />
          </div>
        </header>

        {documentAlert && documentAlert.message ? (
          <div
            className={`driver-dashboard-content__alert driver-dashboard-content__alert--${documentAlert.intent}`}
            role="alert"
          >
            <Icon name="warning" size="md" />
            <p className="driver-dashboard-content__alert-text">{documentAlert.message}</p>
            <SecondaryButton
              size="sm"
              variant="outlined"
              onClick={() => navigateInApp("/driver/documents")}
            >
              Review documents
            </SecondaryButton>
          </div>
        ) : null}

        <section
          className={[
            "driver-dashboard-content__bottom-sheet",
            sheetExpanded ? "is-expanded" : "is-collapsed",
          ].join(" ")}
          aria-label="Driver dashboard sheet"
        >
          <div
            className="driver-dashboard-content__sheet-grip"
            role="button"
            tabIndex={0}
            aria-label={sheetExpanded ? "Collapse dashboard" : "Expand dashboard"}
            aria-pressed={sheetExpanded}
            onClick={toggleSheet}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onKeyDown={handleKeyDown}
          >
            <span className="driver-dashboard-content__grip-bar" aria-hidden="true" />
          </div>

          <div className="driver-dashboard-content__sheet-summary" aria-live="polite">
            <div className="driver-dashboard-content__summary-status">
              <div>
                <h2 className="driver-dashboard-content__status-title">
                  {isOnline ? "You are online" : "You are offline"}
                </h2>
                <p className="driver-dashboard-content__status-caption">
                  {isOnline
                    ? "Receiving ride requests near you."
                    : "Go online to start accepting trips."}
                </p>
              </div>
              <OnlineStatus online={isOnline} />
            </div>

            <div className="driver-dashboard-content__summary-kpis">
              <Kpi icon="🚗" value={todayTripsCount} label="Trips" />
              <Kpi icon="💰" value={todayEarningsFormatted} label="Earnings" />
            </div>

            {documentsBlockOnline && !isOnline ? (
              <SecondaryButton
                fullWidth
                onClick={() => navigateInApp("/driver/documents")}
              >
                Upload documents
              </SecondaryButton>
            ) : (
              <PrimaryButton
                fullWidth
                onClick={onToggleAvailability}
                isLoading={toggleLoading}
                disabled={toggleLoading || (!isOnline && documentsBlockOnline)}
                aria-label={isOnline ? "Go offline" : "Go online"}
              >
                {toggleLoading
                  ? "Updating..."
                  : isOnline
                  ? "Go Offline"
                  : "Go Online"}
              </PrimaryButton>
            )}

            {toggleError ? (
              <p className="driver-dashboard-content__error" role="alert">
                {toggleError}
              </p>
            ) : null}
          </div>

          <div className="driver-dashboard-content__sheet-body">
            <Section className="driver-dashboard-content__section" aria-label="Today's performance">
              <h3 className="yds-section-title">Today's performance</h3>
              <div className="driver-dashboard-content__kpi-grid">
                <Kpi icon="🚗" value={todayTripsCount} label="Trips" />
                <Kpi icon="💰" value={todayEarningsFormatted} label="Earnings" />
                <Kpi icon="✅" value={`${acceptanceRate}%`} label="Acceptance" />
                {rating > 0 ? <Kpi icon="⭐" value={rating.toFixed(1)} label="Rating" /> : null}
                {completion > 0 ? <Kpi icon="🎯" value={`${Math.round(completion)}%`} label="Completion" /> : null}
                {onlineHours > 0 ? <Kpi icon="🕒" value={`${onlineHours}h`} label="Online" /> : null}
                {missedRides > 0 ? <Kpi icon="🔔" value={missedRides} label="Missed" /> : null}
              </div>
            </Section>

            {driverScore > 0 && driverScoreLabel ? (
              <Section className="driver-dashboard-content__section" aria-label="Driver score">
                <h3 className="yds-section-title">Driver score</h3>
                <p className="driver-dashboard-content__sheet-score">
                  {driverScore}/100 · {driverScoreLabel}
                </p>
              </Section>
            ) : null}

            <Section className="driver-dashboard-content__section" aria-label="Earnings summary">
              <h3 className="yds-section-title">Earnings</h3>
              <div className="driver-dashboard-content__earnings-grid">
                <EarningsCard
                  title="Today"
                  amount={todayEarningsFormatted}
                  period="Today's earnings"
                />
                {weeklyEarnings > 0 ? (
                  <EarningsCard
                    title="This week"
                    amount={weeklyEarningsFormatted}
                    period="Weekly earnings"
                  />
                ) : null}
              </div>
              <SecondaryButton
                variant="text"
                fullWidth
                onClick={() => navigateInApp("/driver/wallet")}
              >
                Open wallet
              </SecondaryButton>
            </Section>

            <Section className="driver-dashboard-content__section" aria-label="Quick actions">
              <h3 className="yds-section-title">Quick actions</h3>
              <div className="driver-dashboard-content__quick-actions">
                <QuickActionTile
                  title="Earnings"
                  icon={<Icon name="earnings" size="lg" />}
                  onClick={() => navigateInApp("/driver/earnings")}
                  aria-label="Open earnings"
                />
                <QuickActionTile
                  title="History"
                  icon={<Icon name="history" size="lg" />}
                  onClick={() => navigateInApp("/driver/history")}
                  aria-label="Open ride history"
                />
                <QuickActionTile
                  title="Documents"
                  icon={<Icon name="documents" size="lg" />}
                  onClick={() => navigateInApp("/driver/documents")}
                  aria-label="Open documents"
                />
                <QuickActionTile
                  title="Support"
                  icon={<Icon name="support" size="lg" />}
                  onClick={() => navigateInApp("/driver/support")}
                  aria-label="Open support"
                />
              </div>
            </Section>

            {recentTrips.length > 0 ? (
              <Section className="driver-dashboard-content__section" aria-label="Recent activity">
                <h3 className="yds-section-title">Recent trips</h3>
                <ul className="driver-dashboard-content__recent-list">
                  {recentTrips.map((ride) => (
                    <li key={ride.id} className="driver-dashboard-content__recent-item">
                      <span className="yds-type-body">{ride.destination || "Trip"}</span>
                      <span className="yds-type-caption">
                        {ride.completed_at
                          ? new Date(ride.completed_at).toLocaleDateString()
                          : ride.created_at
                          ? new Date(ride.created_at).toLocaleDateString()
                          : ""}
                        {" "}
                        {ride.fare ? formatMoney(ride.fare) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                <SecondaryButton
                  variant="text"
                  fullWidth
                  onClick={() => navigateInApp("/driver/history")}
                >
                  View all trips
                </SecondaryButton>
              </Section>
            ) : null}
          </div>
        </section>
      </div>
    </ScreenContainer>
  );
}

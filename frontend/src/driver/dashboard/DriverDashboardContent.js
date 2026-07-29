import React, { useMemo } from "react";
import {
  ProfileHeader,
  QuickActionTile,
  StatCard,
  EarningsCard,
  PrimaryButton,
  SecondaryButton,
  OnlineStatus,
  StatusChip,
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
  const greeting = useMemo(() => getGreeting(), []);
  const photoUrl = driverProfile?.driver_photo || driverProfile?.profile_picture || "";
  const level = driverProfile?.driver_level || "bronze";
  const approved = driverProfile?.is_approved || driverProfile?.approval_status === "approved";

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

  const documentAlert = useMemo(
    () => getDocumentAlertProps(documentsAlertLevel, driverProfile),
    [documentsAlertLevel, driverProfile]
  );

  const weeklyEarnings = earningsByPeriod?.week ?? 0;
  const todayEarningsFormatted = formatMoney(todayEarnings ?? 0);
  const weeklyEarningsFormatted = formatMoney(weeklyEarnings);

  const recentTrips = useMemo(() => {
    const trips = Array.isArray(recentRides)
      ? recentRides.filter((r) => r.status === "completed").slice(0, 3)
      : [];
    return trips;
  }, [recentRides]);

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
      <div className="driver-dashboard-content__scroll">
        <header className="driver-dashboard-content__header">
          <ProfileHeader
            name={`${greeting}, ${name}`}
            subtitle={level ? `Level ${String(level).charAt(0).toUpperCase() + String(level).slice(1)}` : "Driver"}
            photoUrl={photoUrl}
            badge={
              approved ? (
                <StatusChip intent="success" dot size="sm">Verified</StatusChip>
              ) : (
                <StatusChip intent="warning" dot size="sm">Pending approval</StatusChip>
              )
            }
          />
          <div className="driver-dashboard-content__header-actions">
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

        <section className="driver-dashboard-content__availability" aria-label="Driver availability">
          <div className="driver-dashboard-content__status-row">
            <div>
              <h2 className="yds-type-title" style={{ margin: 0 }}>
                {isOnline ? "You are online" : "You are offline"}
              </h2>
              <p className="yds-type-caption" style={{ margin: 0 }}>
                {isOnline
                  ? "Receiving ride requests near you."
                  : "Go online to start accepting trips."}
              </p>
            </div>
            <OnlineStatus online={isOnline} />
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
        </section>

        {documentsAlert && documentAlert ? (
          <section className="driver-dashboard-content__alerts" aria-label="Driver alerts">
            <div className={`driver-dashboard-content__alert driver-dashboard-content__alert--${documentAlert.intent}`}>
              <Icon name="warning" size="md" />
              <p className="yds-type-body" style={{ margin: 0 }}>{documentAlert.message}</p>
              <SecondaryButton
                size="sm"
                variant="outlined"
                onClick={() => navigateInApp("/driver/documents")}
              >
                Review documents
              </SecondaryButton>
            </div>
          </section>
        ) : null}

        <Section className="driver-dashboard-content__section" aria-label="Performance summary">
          <h3 className="yds-section-title">Today's performance</h3>
          <div className="driver-dashboard-content__kpi-grid">
            <StatCard label="Trips" value={todayTripsCount} />
            <StatCard label="Earnings" value={todayEarningsFormatted} />
            <StatCard label="Acceptance" value={`${acceptanceRate}%`} />
            {rating > 0 ? <StatCard label="Rating" value={rating.toFixed(1)} /> : null}
            {completion > 0 ? <StatCard label="Completion" value={`${Math.round(completion)}%`} /> : null}
            {onlineHours > 0 ? <StatCard label="Online" value={`${onlineHours}h`} /> : null}
            {missedRides > 0 ? <StatCard label="Missed" value={missedRides} /> : null}
          </div>
        </Section>

        <Section className="driver-dashboard-content__section" aria-label="Earnings summary">
          <h3 className="yds-section-title">Earnings</h3>
          <div className="driver-dashboard-content__earnings-grid">
            <EarningsCard title="Today" amount={todayEarningsFormatted} period="Today's earnings" />
            {weeklyEarnings > 0 ? (
              <EarningsCard title="This week" amount={weeklyEarningsFormatted} period="Weekly earnings" />
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
    </ScreenContainer>
  );
}

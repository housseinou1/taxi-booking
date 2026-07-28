import React from "react";
import { formatMoney, MARKET } from "../../marketConfig";
import { openExternalNavigation } from "../utils/externalNavigation";
import { PrimaryButton, Button } from "../../design-system/components";
import "./DriverLiveTripBar.css";

function ProgressRing({ progress, label, sublabel, tone = "green", pulse = false }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <div className={`driver-live-ring driver-live-ring--${tone}${pulse ? " is-pulse" : ""}`}>
      <svg viewBox="0 0 88 88" aria-hidden="true">
        <circle className="driver-live-ring__track" cx="44" cy="44" r={radius} />
        <circle
          className="driver-live-ring__fill"
          cx="44"
          cy="44"
          r={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="driver-live-ring__center">
        <strong>{label}</strong>
        {sublabel ? <span>{sublabel}</span> : null}
      </div>
    </div>
  );
}

export default function DriverLiveTripBar({
  ride,
  liveState,
  distanceKm = null,
  locationPending = false,
  onOpenNavigation,
  onNoShow,
}) {
  if (!ride || !liveState) return null;

  const status = ride.status;
  const distanceLabel =
    locationPending
      ? "Waiting for your location"
      : distanceKm != null && Number.isFinite(Number(distanceKm)) && Number(distanceKm) > 0
      ? `${Number(distanceKm).toFixed(1)} km`
      : null;
  const riderName = ride.rider_name ||
    [ride.rider_first_name, ride.rider_last_name].filter(Boolean).join(" ") || null;
  const riderPhone = ride.rider_phone || ride.private_call_number || null;

  const handleNavigate = () => {
    const target = status === "in_progress" ? "destination" : "pickup";
    const opened = openExternalNavigation(ride, target);
    if (onOpenNavigation) onOpenNavigation(target, opened);
  };

  if (status === "driver_arriving") {
    const etaProgress =
      liveState.arrivingEta != null && liveState.arrivingEta > 0
        ? 1 - liveState.arrivingEta / Math.max(liveState.arrivingEta + 30, 120)
        : 0.35;
    return (
      <section className="driver-live-bar driver-live-bar--arriving" aria-live="polite">
        <ProgressRing
          progress={etaProgress}
          label={liveState.arrivingEtaLabel}
          sublabel="to pickup"
          tone="blue"
        />
        <div className="driver-live-bar__copy">
          <strong>
            {riderName ? `Picking up ${riderName}` : "Arrival countdown"}
          </strong>
          <p>{distanceLabel ? `${distanceLabel} away · ${ride.pickup || ""}` : (ride.pickup || "En route to pickup")}</p>
          <div className="driver-live-bar__btn-row">
            <PrimaryButton
              size="sm"
              iconLeft="🗺️"
              onClick={handleNavigate}
              aria-label="Navigate to pickup"
            >
              Navigate
            </PrimaryButton>
            {riderPhone && (
              <PrimaryButton
                as="a"
                href={`tel:${riderPhone}`}
                size="sm"
                iconLeft="📞"
                className="driver-live-bar__nav-btn--call"
                aria-label="Call rider"
              >
                Call
              </PrimaryButton>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (status === "driver_arrived") {
    const freeMins = Math.floor(liveState.freeWaitSeconds / 60);
    const remaining = Math.max(0, liveState.maxWaitSeconds - liveState.waitedSeconds);
    return (
      <section
        className={`driver-live-bar driver-live-bar--waiting${liveState.billingStarted ? " is-billing" : ""}`}
        aria-live="polite"
      >
        <ProgressRing
          progress={liveState.waitProgress}
          label={liveState.formatCountdown(liveState.waitedSeconds)}
          sublabel={liveState.inFreeWait ? "free wait" : "waiting"}
          tone={liveState.billingStarted ? "amber" : "green"}
          pulse={liveState.noShowReady}
        />
        <div className="driver-live-bar__copy">
          <strong>
            {liveState.inFreeWait
              ? `Free wait · ${liveState.formatCountdown(
                  Math.max(0, liveState.freeWaitSeconds - liveState.waitedSeconds)
                )} left`
              : `Waiting fee · ${formatMoney(liveState.waitingFee)}`}
          </strong>
          <p>
            {freeMins} min free · {MARKET.waiting?.perMinuteFee ?? 50} {MARKET.currency}/min
            {!liveState.noShowReady && (
              <> · No-show in {liveState.formatCountdown(remaining)}</>
            )}
          </p>
          <div className="driver-live-bar__btn-row">
            {riderPhone && (
              <PrimaryButton
                as="a"
                href={`tel:${riderPhone}`}
                size="sm"
                iconLeft="📞"
                className="driver-live-bar__nav-btn--call"
                aria-label="Call rider"
              >
                Call Rider
              </PrimaryButton>
            )}
            {liveState.noShowReady && onNoShow && (
              <Button
                variant="danger"
                size="sm"
                iconLeft="🚫"
                onClick={onNoShow}
                aria-label="Report rider absent"
              >
                Rider Absent
              </Button>
            )}
          </div>
          {liveState.noShowReady ? (
            <span className="driver-live-bar__badge driver-live-bar__badge--ready">
              ⚠️ Rider no-show unlocked — tap above
            </span>
          ) : liveState.noShowUnlocked && !liveState.nearPickup ? (
            <span className="driver-live-bar__badge driver-live-bar__badge--gps">
              📍 Move closer to pickup to confirm no-show
            </span>
          ) : null}
        </div>
      </section>
    );
  }

  if (status === "in_progress") {
    return (
      <section className="driver-live-bar driver-live-bar--trip" aria-live="polite">
        <div className="driver-live-bar__copy driver-live-bar__copy--row">
          <div>
            <strong>{riderName ? `Trip with ${riderName}` : "Trip in progress"}</strong>
            <p>{distanceLabel ? `${distanceLabel} to destination` : (ride.destination || "Follow navigation")}</p>
          </div>
          <PrimaryButton
            size="sm"
            iconLeft="🏁"
            onClick={handleNavigate}
            aria-label="Navigate to destination"
          >
            Navigate
          </PrimaryButton>
        </div>
      </section>
    );
  }

  return null;
}

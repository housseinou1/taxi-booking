import React, { useEffect, useMemo, useState } from "react";

import { CourierActionButton, CourierStickyActionBar } from "./components/CourierActionButton";
import CourierLocationCards from "./components/CourierLocationCards";
import CourierTripTimeline from "./components/CourierTripTimeline";
import DeliveryDropoffProof from "./DeliveryDropoffProof";
import DeliveryPickupProof from "./DeliveryPickupProof";
import DeliveryChatFab from "./components/DeliveryChatFab";
import { isDeliveryChatAvailable } from "./deliveryChatUtils";
import { hasInstructionContent } from "./deliveryInstructionUtils";
import {
  getCourierTimelineStep,
  getCourierTripEta,
  getCourierTripHeadline,
  getNavigationPoint,
  getTripStage,
  openExternalNavigation,
  TRIP_STAGES,
} from "./deliveryTrip";

function formatCategory(category) {
  if (!category) return "Parcel";
  return String(category).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPickupContact(delivery) {
  return {
    name: delivery.customer_name || delivery.sender_name || delivery.recipient_name,
    phone: delivery.customer_phone || delivery.sender_phone || delivery.recipient_phone,
  };
}

function getDropoffContact(delivery, activeStop) {
  if (activeStop) {
    return { name: activeStop.recipient_name, phone: activeStop.recipient_phone };
  }
  return { name: delivery.recipient_name, phone: delivery.recipient_phone };
}

export default function DeliveryCourierTrip({
  delivery,
  onArrive,
  onPickup,
  onStart,
  onConfirm,
  onConfirmStop,
  onDeliveryException,
  onCancel,
  onCall,
  onChat,
  onResendPin,
  onAdminSupport,
  busy = false,
  chatUnread = 0,
}) {
  const stage = getTripStage(delivery);
  const navPoint = getNavigationPoint(delivery);
  const [activeStopId, setActiveStopId] = useState(null);
  const [dropoffArrived, setDropoffArrived] = useState(false);

  useEffect(() => {
    setDropoffArrived(false);
  }, [delivery?.id, delivery?.status]);

  const pendingStops = (delivery.stops || []).filter((stop) => stop.status !== "delivered");
  const activeStop = pendingStops.find((stop) => stop.id === activeStopId) || pendingStops[0] || null;

  const showDropoffProof =
    stage === TRIP_STAGES.DROPOFF && (dropoffArrived || delivery.status === "delivering");

  const showPickupProof = stage === TRIP_STAGES.ARRIVING;
  const hideTripActionBar =
    showDropoffProof || showPickupProof || delivery.status === "delivery_exception";

  const timelineStep = getCourierTimelineStep(delivery, {
    dropoffArrived,
    showPickupProof,
    showDropoffProof,
  });

  const activeLeg = useMemo(() => {
    if (timelineStep >= 4) return "dropoff";
    return "pickup";
  }, [timelineStep]);

  const pickupContact = getPickupContact(delivery);
  const dropoffContact = getDropoffContact(delivery, activeStop);
  const dropoffAddress = activeStop?.address || delivery.destination;
  const dropoffInstructions = hasInstructionContent(delivery.dropoff_instructions)
    ? delivery.dropoff_instructions
    : { extra_instructions: delivery.customer_notes || "" };
  const pickupInstructions = hasInstructionContent(delivery.pickup_instructions)
    ? delivery.pickup_instructions
    : null;

  const renderStickyActions = () => {
    if (hideTripActionBar) return null;

    const status = delivery.status;

    if (status === "accepted") {
      return (
        <CourierStickyActionBar split>
          <CourierActionButton
            variant="decline"
            iconName="check"
            loading={busy}
            onClick={onArrive}
            ariaLabel="I've arrived at pickup"
          >
            I've Arrived
          </CourierActionButton>
          {navPoint ? (
            <CourierActionButton
              variant="accept"
              iconName="navigate"
              onClick={() => openExternalNavigation(navPoint)}
              ariaLabel="Navigate to pickup"
            >
              Navigate to Pickup
            </CourierActionButton>
          ) : (
            <CourierActionButton
              variant="accept"
              iconName="check"
              loading={busy}
              onClick={onArrive}
              ariaLabel="I've arrived at pickup"
            >
              I've Arrived
            </CourierActionButton>
          )}
        </CourierStickyActionBar>
      );
    }

    if (status === "picked_up") {
      return (
        <CourierStickyActionBar split>
          <CourierActionButton
            variant="decline"
            iconName="check"
            loading={busy}
            onClick={onStart}
            ariaLabel="Start delivery"
          >
            Start Delivery
          </CourierActionButton>
          {navPoint ? (
            <CourierActionButton
              variant="accept"
              iconName="navigate"
              onClick={() => openExternalNavigation(navPoint)}
              ariaLabel="Navigate to dropoff"
            >
              Navigate to Dropoff
            </CourierActionButton>
          ) : (
            <CourierActionButton
              variant="accept"
              iconName="check"
              loading={busy}
              onClick={onStart}
              ariaLabel="Start delivery"
            >
              Picked Up
            </CourierActionButton>
          )}
        </CourierStickyActionBar>
      );
    }

    if (status === "in_transit" || (stage === TRIP_STAGES.DROPOFF && !showDropoffProof)) {
      return (
        <CourierStickyActionBar>
          <CourierActionButton
            variant="accept"
            iconName="check"
            fullWidth
            loading={busy}
            onClick={() => setDropoffArrived(true)}
            ariaLabel="Arrived at dropoff"
          >
            Arrived at Dropoff
          </CourierActionButton>
        </CourierStickyActionBar>
      );
    }

    return null;
  };

  return (
    <div className="cce-trip">
      <div className="cce-trip__body">
        <header className="cce-trip__eta">
          <div className="cce-trip__eta-item">
            <strong>{getCourierTripEta(delivery)}</strong>
            <span>ETA</span>
          </div>
          <div className="cce-trip__eta-item">
            <strong>{delivery.distance_km ?? "—"} km</strong>
            <span>Distance</span>
          </div>
          <div className="cce-trip__eta-item is-accent">
            <strong>{delivery.fare} MRU</strong>
            <span>Earnings</span>
          </div>
        </header>

        <div className="cce-trip__status">
          <span className="cce-trip__badge">{getCourierTripHeadline(delivery, timelineStep)}</span>
        </div>

        <CourierTripTimeline
          delivery={delivery}
          dropoffArrived={dropoffArrived}
          showPickupProof={showPickupProof}
          showDropoffProof={showDropoffProof}
        />

        <CourierLocationCards
          pickup={delivery.pickup}
          pickupName={pickupContact.name}
          pickupPhone={pickupContact.phone}
          pickupInstructions={pickupInstructions}
          dropoff={dropoffAddress}
          dropoffName={dropoffContact.name}
          dropoffPhone={dropoffContact.phone}
          dropoffAltPhone={delivery.recipient_alt_phone}
          dropoffInstructions={dropoffInstructions}
          activeLeg={activeLeg}
          onCallPickup={() => onCall?.(pickupContact.phone)}
          onCallDropoff={() => onCall?.(dropoffContact.phone || delivery.recipient_alt_phone)}
          onChat={onChat}
          onNavigatePickup={() =>
            openExternalNavigation({
              lat: delivery.pickup_lat,
              lng: delivery.pickup_lng,
              label: delivery.pickup,
            })
          }
          onNavigateDropoff={() =>
            openExternalNavigation({
              lat: activeStop?.latitude || delivery.destination_lat,
              lng: activeStop?.longitude || delivery.destination_lng,
              label: dropoffAddress,
            })
          }
        />

        <div className="cce-pill-row">
          <span className="cce-pill">{formatCategory(delivery.service_category)}</span>
          <span className="cce-pill">{(delivery.package_type || "small").toUpperCase()}</span>
          {delivery.weight_kg ? <span className="cce-pill">{delivery.weight_kg} kg</span> : null}
        </div>

        {delivery.status === "delivery_exception" ? (
          <div className="cce-location-card">
            <strong>Sent to Yala support</strong>
            <p style={{ margin: "6px 0 0" }}>This delivery is waiting for admin review.</p>
          </div>
        ) : null}

        {showPickupProof ? (
          <DeliveryPickupProof delivery={delivery} busy={busy} onSubmit={(payload) => onPickup(delivery, payload)} />
        ) : null}

        {stage === TRIP_STAGES.DROPOFF && delivery.stops?.length && showDropoffProof ? (
          <div>
            {pendingStops.map((stop) => (
              <button
                key={stop.id}
                type="button"
                className={`cce-pill ${activeStop?.id === stop.id ? "is-active" : ""}`}
                style={{ marginRight: 8, marginBottom: 8 }}
                onClick={() => setActiveStopId(stop.id)}
              >
                Stop #{stop.stop_order} · {stop.recipient_name}
              </button>
            ))}
            {activeStop ? (
              <DeliveryDropoffProof
                recipientName={activeStop.recipient_name}
                recipientPhone={activeStop.recipient_phone}
                title={`Stop #${activeStop.stop_order}`}
                subtitle={`Ask ${activeStop.recipient_name} for the 4-digit PIN.`}
                busy={busy}
                onSubmit={({ pin, proofFile }) => onConfirmStop(delivery, activeStop.id, pin, proofFile)}
                onCall={onCall}
                onChat={onChat}
                onResendPin={onResendPin}
                onAdminSupport={onAdminSupport}
              />
            ) : null}
          </div>
        ) : null}

        {stage === TRIP_STAGES.DROPOFF && !delivery.stops?.length && showDropoffProof ? (
          <DeliveryDropoffProof
            recipientName={delivery.recipient_name}
            recipientPhone={delivery.recipient_phone}
            busy={busy}
            requiresPhoto={Boolean(delivery.requires_proof_photo)}
            onSubmit={({ pin, proofFile }) => onConfirm(delivery, pin, proofFile)}
            onException={(payload) => onDeliveryException?.(delivery, payload)}
            onCall={onCall}
            onChat={onChat}
            onResendPin={onResendPin}
            onAdminSupport={onAdminSupport}
          />
        ) : null}

        {onCancel && ["accepted", "courier_arriving"].includes(delivery.status) ? (
          <CourierActionButton
            variant="ghost-danger"
            fullWidth
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this delivery? The customer will be notified.")) {
                onCancel(delivery);
              }
            }}
          >
            Cancel delivery
          </CourierActionButton>
        ) : null}
      </div>

      {renderStickyActions()}

      {onChat && isDeliveryChatAvailable(delivery.status) ? (
        <DeliveryChatFab onClick={onChat} unread={chatUnread} label="Message customer" />
      ) : null}
    </div>
  );
}

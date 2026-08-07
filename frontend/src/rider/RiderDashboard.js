import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { API_URL } from "../apiConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import SafetyEmergencyPanel from "../safety/SafetyEmergencyPanel";
import RideChat from "../components/RideChat";
import LocationInput from "./components/LocationInput";
import {
  joinRideUpdates,
  leaveRideUpdates,
  subscribeRideUpdates,
  sendRideUpdate,
} from "../socket";
import riderApi from "./services/authenticatedApi";
import {
  languageOptions,
  normalizeLanguageCode,
} from "../i18n";
import {
  MARKET,
  calculateDistanceKm,
  calculateFare,
  formatMoney,
  getLocationByLabel,
  getLocationsByCity,
  isPointInServiceArea,
} from "../marketConfig";

const fetchDrivingRoute = async (points) => {
  if (!Array.isArray(points) || points.length < 2 || points.some((point) => !point)) return null;

  const coordinates = points.map((point) => `${point[1]},${point[0]}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];

  if (!route) return null;

  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
};

const rideIcons = {
  regular: "Y",
  comfort: "C",
  xl: "XL",
  share: "S",
};

const savedPlaces = [
  { key: "home", detailKey: "homeDetail", icon: "H", type: "pickup" },
  { key: "work", detailKey: "workDetail", icon: "W", type: "destination" },
  { key: "favorites", detailKey: "favoritesDetail", icon: "F", type: "favorites" },
];

const riderQuickLinks = [
  { key: "delivery", label: "Delivery", path: "/delivery" },
  { key: "trips", path: "/rider-history" },
  { key: "places", path: "/saved-places" },
  { key: "reviews", path: "/rider-reviews" },
  { key: "safety", action: "safety" },
  { key: "logout", action: "logout" },
];

const logoSrc = "/yala-rider-logo.png";
const RIDER_PURPLE = "#00A651";
const RIDER_PURPLE_SOFT = "rgba(0, 166, 81, 0.14)";
const RIDER_PURPLE_BORDER = "rgba(0, 166, 81, 0.35)";
const YALA_GOLD = "#F3BD34";
const YALA_NAVY = "#08111F";

const getStatusLabel = (status, t) => {
  if (!status) return t("riderDashboard.status.ready");
  if (["requested", "pending"].includes(status)) return t("riderDashboard.status.requested");
  if (["accepted", "driver_arriving"].includes(status)) return t("riderDashboard.status.driverArriving");
  if (status === "driver_arrived") return t("riderDashboard.status.driverArrived");
  if (status === "in_progress") return t("riderDashboard.status.inProgress");
  if (status === "completed") return t("riderDashboard.status.completed");
  if (status === "cancelled") return t("riderDashboard.status.cancelled");
  return status.replace("_", " ");
};

const rideStatusSteps = [
  { key: "finding_driver", titleKey: "findingDriverTitle", textKey: "findingDriverText" },
  { key: "driver_arriving", titleKey: "driverArrivingTitle", textKey: "driverArrivingText" },
  { key: "driver_arrived", titleKey: "driverArrivedTitle", textKey: "driverArrivedText" },
  { key: "in_progress", titleKey: "inProgressTitle", textKey: "inProgressText" },
  { key: "completed", titleKey: "completedTitle", textKey: "completedText" },
];

const getStatusStepIndex = (status) => {
  if (["requested", "pending"].includes(status)) return 0; // Finding Driver
  if (["accepted", "driver_arriving"].includes(status)) return 1; // Driver Arriving
  if (status === "driver_arrived") return 2;
  if (status === "in_progress") return 3;
  if (status === "completed") return 4;
  return -1;
};

const activeRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
]);

const liveDriverStatuses = new Set([
  "accepted",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
]);

const cancellableRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "driver_arrived",
]);

const getDriverPhoto = (ride) =>
  ride?.driver_picture ||
  ride?.driver_photo ||
  ride?.driver_profile_picture ||
  ride?.driver_image ||
  "";

const getVehicleLabel = (ride) =>
  ride?.vehicle ||
  [ride?.vehicle_make, ride?.vehicle_model].filter(Boolean).join(" ") ||
  ride?.car_type ||
  "Vehicle";

const getPlateNumber = (ride) =>
  ride?.plate_number || ride?.vehicle_plate || ride?.plate || "pending";

export default function RiderDashboard() {
  const { t, i18n } = useTranslation();
  const [city, setCity] = useState(MARKET.defaultCity);
  const [pickup, setPickup] = useState(MARKET.defaultPickup.label);
  const [destination, setDestination] = useState(MARKET.defaultDestination.label);
  const [stops, setStops] = useState([]);
  const [distance, setDistance] = useState(
    calculateDistanceKm(
      MARKET.defaultPickup.position,
      MARKET.defaultDestination.position
    )
  );
  const [rideType, setRideType] = useState("regular");
  const [fare, setFare] = useState(calculateFare("regular", 10));
  const [requesting, setRequesting] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [liveDriverRoute, setLiveDriverRoute] = useState([]);
  const [liveDriverRouteInfo, setLiveDriverRouteInfo] = useState(null);
  const [currentRide, setCurrentRide] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [animatedDriverPosition, setAnimatedDriverPosition] = useState(null);
  const [riderIdentity, setRiderIdentity] = useState({
    phone_number: "",
    national_id_number: "",
    national_id_document: "",
    has_national_id_document: false,
    profile_picture: "",
    has_profile_picture: false,
    member_since_year: "",
    years_using_app: 0,
  });
  const [nationalIdFile, setNationalIdFile] = useState(null);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMessage, setIdentityMessage] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [showAccountPanel, setShowAccountPanel] = useState(false);

  const [showSafetyPanel, setShowSafetyPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [lastCancellation, setLastCancellation] = useState(null);

  const [rideHistory, setRideHistory] = useState([]);

  // GPS Auto-fill state (Task 1)
  const [gpsPosition, setGpsPosition] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [gpsError, setGpsError] = useState(false);

  // Payment method state (Task 5)
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState({ payment_type: "cash", display_name: "Cash" });
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);


  const token = localStorage.getItem("access");

  const cityLocations = getLocationsByCity(city);
  const selectedCity = MARKET.cities.find((item) => item.label === city);
  const pickupLocation = getLocationByLabel(pickup, city);
  const stopLocations = useMemo(
    () =>
      stops.map((stop) => ({
        id: stop.id,
        label: stop.location,
        location: stop.location ? getLocationByLabel(stop.location, city) : null,
      })),
    [stops, city]
  );
  const destinationLocation = getLocationByLabel(destination, city);
  const pickupPosition = pickupLocation?.position || MARKET.defaultPickup.position;
  const stopPositions = useMemo(
    () => stopLocations.map((stop) => stop.location?.position).filter(Boolean),
    [stopLocations]
  );
  const destinationPosition =
    destinationLocation?.position || MARKET.defaultDestination.position;
  const routePoints = useMemo(
    () => [pickupPosition, ...stopPositions, destinationPosition].filter(Boolean),
    [pickupPosition, stopPositions, destinationPosition]
  );
  const activeStatus = getStatusLabel(currentRide?.status, t);
  const shouldTrackDriver = liveDriverStatuses.has(currentRide?.status);
  const statusStepIndex = getStatusStepIndex(currentRide?.status);
  const trackingTarget = useMemo(
    () =>
      currentRide?.status === "in_progress"
        ? [
            Number(currentRide?.destination_lat || destinationPosition[0]),
            Number(currentRide?.destination_lng || destinationPosition[1]),
          ]
        : [
            Number(currentRide?.pickup_lat || pickupPosition[0]),
            Number(currentRide?.pickup_lng || pickupPosition[1]),
          ],
    [
      currentRide?.destination_lat,
      currentRide?.destination_lng,
      currentRide?.pickup_lat,
      currentRide?.pickup_lng,
      currentRide?.status,
      destinationPosition,
      pickupPosition,
    ]
  );
  const displayedDriverPosition = driverPosition || animatedDriverPosition;
  const liveTrackingDistance = shouldTrackDriver
    ? liveDriverRouteInfo?.distanceKm || calculateDistanceKm(displayedDriverPosition, trackingTarget)
    : null;
  const liveTrackingEta = shouldTrackDriver
    ? liveDriverRouteInfo?.etaMinutes ||
      (liveTrackingDistance ? Math.max(1, Math.round((liveTrackingDistance / 32) * 60)) : null)
    : null;
  const canCancelCurrentRide =
    currentRide && cancellableRideStatuses.has(currentRide.status);
  const rideName = useCallback((type) => t(`riderDashboard.rideTypes.${type}.name`), [t]);
  const rideDescription = useCallback((type) => t(`riderDashboard.rideTypes.${type}.description`), [t]);
  const rideSeatsLabel = useCallback((type) => t(`riderDashboard.rideTypes.${type}.seats`), [t]);
  const rideEtaLabel = useCallback((type) => t(`riderDashboard.rideTypes.${type}.eta`), [t]);
  const selectedRideLabel = rideName(rideType);
  const currentLanguage = normalizeLanguageCode(i18n.language);

  const changeLanguage = (event) => {
    i18n.changeLanguage(normalizeLanguageCode(event.target.value));
  };

  const logoutRider = () => {
    [
      "access",
      "refresh",
      "user",
      "selectedRideId",
      "needs_payment_setup",
      "needs_vehicle_setup",
      "sx_login_redirect",
      "yala_next_place",
    ].forEach((key) => localStorage.removeItem(key));
    // Clear secure storage tokens (fire-and-forget for native apps)
    import("../native/storage").then(({ removeToken }) => {
      removeToken("access").catch(() => {});
      removeToken("refresh").catch(() => {});
    }).catch(() => {});

    window.location.replace(`/login?logout=${Date.now()}`);
  };

  const handleSavedPlace = (place) => {
    if (place.type === "pickup") {
      setPickup(MARKET.defaultPickup.label);
      return;
    }

    if (place.type === "destination") {
      const workLocation =
        getLocationByLabel("Nouakchott Center", city) ||
        getLocationByLabel("Centre Ville", city) ||
        MARKET.defaultDestination;
      setDestination(workLocation.label);
      return;
    }

    window.location.href = "/saved-places";
  };

  const addRideStop = () => {
    setStops((current) => [
      ...current,
      {
        id: `stop-${Date.now()}-${current.length}`,
        location: "",
      },
    ]);
  };

  const updateRideStop = (stopId, location) => {
    setStops((current) =>
      current.map((stop) => (stop.id === stopId ? { ...stop, location } : stop))
    );
  };

  const removeRideStop = (stopId) => {
    setStops((current) => current.filter((stop) => stop.id !== stopId));
  };

  const openQuickLink = (item) => {
    if (item.action === "logout") {
      logoutRider();
      return;
    }

    if (item.action === "safety") {
      setShowSafetyPanel(true);
      return;
    }

    if (item.path) {
      window.location.href = item.path;
    }
  };

  const mapMarkers = useMemo(
    () =>
      [
        {
          id: "pickup",
          position: pickupPosition,
          title: `Pickup: ${pickup}`,
          label: "P",
        },
        ...stopLocations
          .filter((stop) => stop.location?.position)
          .map((stop, index) => ({
            id: stop.id,
            position: stop.location.position,
            title: `Stop ${index + 1}: ${stop.label}`,
            label: `${index + 1}`,
          })),
        {
          id: "destination",
          position: destinationPosition,
          title: `Destination: ${destination}`,
          label: "D",
        },
        shouldTrackDriver &&
          displayedDriverPosition && {
          id: "driver",
          position: displayedDriverPosition,
          title: "Driver live location",
          label: "C",
          type: "driver",
        },
      ].filter(Boolean),
    [
      destination,
      destinationPosition,
      displayedDriverPosition,
      pickup,
      pickupPosition,
      shouldTrackDriver,
      stopLocations,
    ]
  );

  useEffect(() => {
    const points = [
      pickupLocation?.position,
      ...stopPositions,
      destinationLocation?.position,
    ].filter(Boolean);
    const automaticDistance = points.reduce((sum, point, index) => {
      if (index === 0) return sum;
      return sum + calculateDistanceKm(points[index - 1], point);
    }, 0);

    if (automaticDistance) {
      setDistance(Number(automaticDistance.toFixed(1)));
    }
  }, [pickupLocation, stopPositions, destinationLocation]);

  useEffect(() => {
    const locations = getLocationsByCity(city);
    const hasSavedPlaceIntent = Boolean(localStorage.getItem("yala_next_place"));

    if (hasSavedPlaceIntent) return;

    if (locations.length >= 2) {
      setPickup(locations[0].label);
      setDestination(locations[1].label);
      setStops([]);
      return;
    }

    if (locations.length === 1) {
      setPickup(locations[0].label);
      setDestination(locations[0].label);
      setStops([]);
    }
  }, [city]);

  useEffect(() => {
    const rawPlace = localStorage.getItem("yala_next_place");
    if (!rawPlace) return;

    try {
      const place = JSON.parse(rawPlace);
      const nextCity = place.city || MARKET.defaultCity;
      const nextLocation = place.location;
      const target = place.target || "destination";

      if (nextCity && nextCity !== city) {
        setCity(nextCity);
      }

      if (nextLocation) {
        if (target === "pickup") {
          setPickup(nextLocation);
        } else {
          setDestination(nextLocation);
        }
      }
    } catch (error) {
    } finally {
      localStorage.removeItem("yala_next_place");
    }
  }, [city]);

  useEffect(() => {
    setFare(calculateFare(rideType, distance));
  }, [rideType, distance]);

  useEffect(() => {
    let cancelled = false;
    const loadRoute = async () => {
      const fallbackRoute = routePoints;

      try {
        const route = await fetchDrivingRoute(routePoints);
        if (cancelled) return;

        setRoutePath(route?.points || fallbackRoute);
        setRouteInfo(route);

        if (route?.distanceKm) {
          setDistance(Number(route.distanceKm.toFixed(1)));
        }
      } catch (error) {
        if (cancelled) return;

        setRoutePath(fallbackRoute);
        setRouteInfo(null);
      }
    };

    loadRoute();

    return () => {
      cancelled = true;
    };
  }, [routePoints]);

  const fetchRiderIdentity = useCallback(async () => {
    try {
      if (!token) return;

      const response = await riderApi.get(`${API_URL}/auth/me/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setRiderIdentity({
        phone_number: response.data.phone_number || "",
        national_id_number: response.data.national_id_number || "",
        national_id_document: response.data.national_id_document || "",
        has_national_id_document: Boolean(response.data.has_national_id_document),
        profile_picture: response.data.profile_picture || "",
        has_profile_picture: Boolean(response.data.has_profile_picture),
        member_since_year: response.data.member_since_year || "",
        years_using_app: response.data.years_using_app || 0,
      });
    } catch (error) {
    }
  }, [token]);

  const fetchCurrentRide = useCallback(async () => {
    try {
      if (!token) return;

      const response = await riderApi.get(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        setRideHistory(response.data);
        // Find active ride, or most recent completed ride (for rating)
        const activeRide = response.data.find((ride) =>
          activeRideStatuses.has(ride.status)
        );
        const recentCompleted = !activeRide
          ? response.data.find((ride) => ride.status === "completed")
          : null;

        // Detect if a previously active ride was cancelled by the driver
        const cancelledRide = response.data.find((ride) => ride.status === "cancelled");
        if (!activeRide && !recentCompleted && cancelledRide) {
          // Ride was cancelled (likely by driver) — clear all ride state
          setCurrentRide(null);
          setRoutePath([]);
          setRouteInfo(null);
          setLiveDriverRoute([]);
          setLiveDriverRouteInfo(null);
          setDriverPosition(null);
          setAnimatedDriverPosition(null);
          return;
        }

        setCurrentRide(activeRide || recentCompleted || null);
        if ((activeRide || recentCompleted) && (activeRide || recentCompleted).status !== "requested") {
          setRequestMessage("");
        }
      } else {
        setRideHistory([]);
        setCurrentRide(null);
      }
    } catch (error) {
    }
  }, [token]);

  const spendingHistory = useMemo(() => {
    const monthly = {};
    let total = 0;
    rideHistory.forEach((ride) => {
      if (ride.status !== "completed") return;
      const amount = Number(ride.fare || 0);
      total += amount;
      const date = new Date(ride.completed_at || ride.updated_at || ride.created_at || Date.now());
      const label = date.toLocaleString("en-US", { month: "short", year: "2-digit" });
      monthly[label] = (monthly[label] || 0) + amount;
    });

    const trend = Object.entries(monthly).slice(-6).map(([label, value]) => ({ label, value }));
    return { total, trend };
  }, [rideHistory]);

  const fetchDriverLocation = useCallback(async () => {
    try {
      const driverId =
        currentRide?.driver ||
        currentRide?.driver_id ||
        currentRide?.driver_user_id;

      if (!driverId) return;

      const response = await riderApi.get(
        `${API_URL}/drivers/location/${driverId}/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const livePosition = [
        Number(response.data.current_lat || response.data.latitude || 18.0735),
        Number(response.data.current_lng || response.data.longitude || -15.9582),
      ];

      setDriverPosition(isPointInServiceArea(livePosition) ? livePosition : null);
    } catch (error) {
    }
  }, [currentRide, token]);

  useEffect(() => {
    fetchCurrentRide();
    fetchRiderIdentity();

    const interval = setInterval(() => {
      fetchCurrentRide();
    }, 2000);

    // Real-time: refresh immediately on WebSocket ride updates
    const unsub = subscribeRideUpdates((msg) => {
      if (msg && (msg.type === "ride_update" || msg.status || msg.ride_id)) {
        setRequestMessage("");

        // Handle driver-initiated cancellation from WebSocket
        if (msg.status === "cancelled" || msg.type === "ride_cancelled") {
          setCurrentRide(null);
          setRoutePath([]);
          setRouteInfo(null);
          setLiveDriverRoute([]);
          setLiveDriverRouteInfo(null);
          setDriverPosition(null);
          setAnimatedDriverPosition(null);
          setLastCancellation({
            tone: "success",
            title: t("riderDashboard.cancel.driverCancelledTitle"),
            text: t("riderDashboard.cancel.driverCancelledText"),
          });
          // Auto-dismiss after 3 seconds
          setTimeout(() => {
            setLastCancellation((current) =>
              current?.tone === "success" ? null : current
            );
          }, 3000);
          return;
        }

        fetchCurrentRide();
      }
    });

    return () => { clearInterval(interval); unsub(); };
  }, [fetchCurrentRide, fetchRiderIdentity, t]);

  // GPS Auto-fill for Pickup Location (Task 1)
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsLoading(false);
      setGpsError(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gps = [position.coords.latitude, position.coords.longitude];
        setGpsPosition(gps);
        setGpsLoading(false);

        // Find nearest known location within 500m
        const allLocations = getLocationsByCity(city);
        let nearest = null;
        let nearestDist = Infinity;
        for (const loc of allLocations) {
          const dist = calculateDistanceKm(gps, loc.position);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = loc;
          }
        }

        if (nearest && nearestDist < 0.5) {
          setPickup(nearest.label);
        } else {
          setPickup("Current Location");
        }
      },
      () => {
        setGpsLoading(false);
        setGpsError(true);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }, []);  // Only run once on mount

  // Fetch payment methods (Task 5)
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const response = await riderApi.get(`${API_URL}/payments/methods/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const methods = Array.isArray(response.data) ? response.data : [];
        setPaymentMethods(methods);
        const defaultMethod = methods.find((m) => m.is_default) || methods[0];
        if (defaultMethod) setSelectedPaymentMethod(defaultMethod);
      } catch (err) {
        // Fallback to cash silently
      }
    };
    if (token) fetchPaymentMethods();
  }, [token]);

  useEffect(() => {
    if (!shouldTrackDriver) {
      setDriverPosition(null);
      setAnimatedDriverPosition(null);
      return;
    }

    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchDriverLocation, shouldTrackDriver]);

  useEffect(() => {
    if (!currentRide?.id || !shouldTrackDriver) return undefined;

    joinRideUpdates(currentRide.id);
    const unsub = subscribeRideUpdates((message) => {
      if (message?.type !== "location_update" || message.lat == null || message.lng == null) return;
      const position = [Number(message.lat), Number(message.lng)];
      if (isPointInServiceArea(position)) setDriverPosition(position);
    });

    return () => {
      unsub();
      leaveRideUpdates(currentRide.id);
    };
  }, [currentRide?.id, shouldTrackDriver]);

  useEffect(() => {
    let cancelled = false;
    if (!shouldTrackDriver || !displayedDriverPosition || !trackingTarget) {
      setLiveDriverRoute([]);
      setLiveDriverRouteInfo(null);
      return undefined;
    }

    const loadApproachRoute = async () => {
      try {
        const route = await fetchDrivingRoute([displayedDriverPosition, trackingTarget]);
        if (cancelled) return;
        setLiveDriverRoute(route?.points || [displayedDriverPosition, trackingTarget]);
        setLiveDriverRouteInfo(route);
      } catch (error) {
        if (cancelled) return;
        setLiveDriverRoute([displayedDriverPosition, trackingTarget]);
        setLiveDriverRouteInfo(null);
      }
    };

    loadApproachRoute();
    return () => {
      cancelled = true;
    };
  }, [displayedDriverPosition, shouldTrackDriver, trackingTarget]);

  useEffect(() => {
    if (!shouldTrackDriver) return undefined;

    if (driverPosition) {
      setAnimatedDriverPosition(driverPosition);
      return undefined;
    }

    const fallbackPath =
      currentRide?.status === "in_progress" && routePath.length > 1
        ? routePath
        : [
            [pickupPosition[0] + 0.018, pickupPosition[1] - 0.018],
            [pickupPosition[0] + 0.012, pickupPosition[1] - 0.012],
            [pickupPosition[0] + 0.006, pickupPosition[1] - 0.006],
            pickupPosition,
          ];

    let index = 0;
    setAnimatedDriverPosition(fallbackPath[0]);

    const interval = setInterval(() => {
      index = Math.min(index + 1, fallbackPath.length - 1);
      setAnimatedDriverPosition(fallbackPath[index]);

      if (index >= fallbackPath.length - 1 && currentRide?.status !== "in_progress") {
        index = fallbackPath.length - 2;
      }
    }, 1600);

    return () => clearInterval(interval);
  }, [
    currentRide?.status,
    driverPosition,
    pickupPosition,
    routePath,
    shouldTrackDriver,
  ]);

  const requestRide = async () => {
    try {
      setRequestMessage("");

      const invalidStop = stopLocations.find((stop) => stop.label && !stop.location);
      const incompleteStop = stops.find((stop) => !stop.location.trim());

      if (invalidStop || incompleteStop) {
        setRequestMessage(t("riderDashboard.messages.invalidStop"));
        return;
      }

      setRequesting(true);

      const rideStops = stopLocations
        .filter((stop) => stop.location?.position)
        .map((stop, index) => ({
          location_name: stop.label,
          latitude: stop.location.position[0],
          longitude: stop.location.position[1],
          stop_order: index + 1,
        }));

      const response = await riderApi.post(
        `${API_URL}/rides/request/`,
        {
          pickup,
          destination,
          pickup_address: pickup,
          destination_address: destination,
          pickup_lat: pickupPosition[0],
          pickup_lng: pickupPosition[1],
          destination_lat: destinationPosition[0],
          destination_lng: destinationPosition[1],
          distance_km: distance,
          distance,
          ride_type: rideType,
          fare,
          stops: rideStops,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const requestedRide = response.data?.ride || response.data;
      setCurrentRide(requestedRide);
      setRideHistory((current) => [
        requestedRide,
        ...current.filter((ride) => ride.id !== requestedRide.id),
      ]);
      setRequestMessage(t("riderDashboard.messages.rideRequested"));

      if (requestedRide?.id) {
        sendRideUpdate({ ride_id: requestedRide.id, status: requestedRide.status, type: "ride_update" });
      }
    } catch (error) {
      const requestError =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        t("riderDashboard.messages.requestFailed");

      setRequestMessage(requestError);
    } finally {
      setRequesting(false);
    }
  };

  const cancelRide = async () => {
    if (!currentRide || !canCancelCurrentRide) return;

    if (!cancelReason.trim()) {
      setLastCancellation({
        tone: "warning",
        title: t("riderDashboard.cancel.chooseReasonTitle"),
        text: t("riderDashboard.cancel.chooseReasonText"),
      });
      return;
    }

    try {
      setCancelSaving(true);

      const response = await riderApi.post(
        `${API_URL}/rides/cancel/${currentRide.id}/`,
        {
          reason: cancelReason.trim(),
          cancelled_by: "rider",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setLastCancellation({
        tone: "success",
        title: t("riderDashboard.cancel.cancelledTitle"),
        text:
          response.data.refund_status ||
          t("riderDashboard.cancel.refundReleased"),
        fee: response.data.cancellation_fee || "0.00",
        reason: cancelReason.trim(),
      });

      // Clear all ride-related state immediately
      setCurrentRide(null);
      setRoutePath([]);
      setRouteInfo(null);
      setLiveDriverRoute([]);
      setLiveDriverRouteInfo(null);
      setDriverPosition(null);
      setAnimatedDriverPosition(null);
      setCancelModalOpen(false);
      setCancelReason("");
      setRequestMessage("");

      // Auto-dismiss the cancellation banner after 3 seconds
      setTimeout(() => {
        setLastCancellation((current) =>
          current?.tone === "success" ? null : current
        );
      }, 3000);

      fetchCurrentRide();
    } catch (error) {
      const cancelError =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        "Could not cancel ride";

      setLastCancellation({
        tone: "error",
        title: t("riderDashboard.cancel.failedTitle"),
        text: cancelError,
      });

      // Auto-dismiss error banner after 5 seconds
      setTimeout(() => {
        setLastCancellation((current) =>
          current?.tone === "error" ? null : current
        );
      }, 5000);
    } finally {
      setCancelSaving(false);
    }
  };

  const goToPayRate = () => {
    if (currentRide?.id) {
      localStorage.setItem("selectedRideId", currentRide.id);
    }

    window.location.href = "/rider-payments";
  };

  const shareTrip = async () => {
    if (!currentRide) return;

    const tripText = `Yala trip #${currentRide.id}: ${
      currentRide.pickup || currentRide.pickup_address
    } to ${currentRide.destination || currentRide.destination_address}. Status: ${
      currentRide.status
    }. Driver: ${currentRide.driver_name || "not assigned yet"}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Yala trip",
          text: tripText,
          url: window.location.href,
        });
        return;
      }

      await navigator.clipboard.writeText(`${tripText} ${window.location.href}`);
      alert(t("riderDashboard.messages.tripCopied"));
    } catch (error) {
      alert(tripText);
    }
  };

  const saveRiderIdentity = async (event) => {
    event.preventDefault();

    try {
      setIdentitySaving(true);
      setIdentityMessage("");

      const payload = new FormData();
      payload.append("phone_number", riderIdentity.phone_number || "");
      payload.append("national_id_number", riderIdentity.national_id_number || "");

      if (nationalIdFile) {
        payload.append("national_id_document", nationalIdFile);
      }

      if (profilePictureFile) {
        payload.append("profile_picture", profilePictureFile);
      }

      const response = await riderApi.post(`${API_URL}/auth/identity/update/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setRiderIdentity({
        phone_number: response.data.user.phone_number || "",
        national_id_number: response.data.user.national_id_number || "",
        national_id_document: response.data.user.national_id_document || "",
        has_national_id_document: Boolean(response.data.user.has_national_id_document),
        profile_picture: response.data.user.profile_picture || "",
        has_profile_picture: Boolean(response.data.user.has_profile_picture),
        member_since_year: response.data.user.member_since_year || riderIdentity.member_since_year,
        years_using_app: response.data.user.years_using_app || riderIdentity.years_using_app,
      });
      setNationalIdFile(null);
      setProfilePictureFile(null);
      setIdentityMessage(t("riderDashboard.messages.identitySaved"));
    } catch (error) {
      setIdentityMessage(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          t("riderDashboard.messages.identityFailed")
      );
    } finally {
      setIdentitySaving(false);
    }
  };

  return (
    <main className="sx-live-ride-page" style={pageStyle}>
      <RiderTrackingStyles />
      <section className="sx-live-map-stage" style={mapStageStyle}>
        <GoogleTripMap
          key={city}
          center={selectedCity?.center || pickupPosition}
          zoom={13}
          style={mapStyle}
          fitPoints={[
            pickupPosition,
            destinationPosition,
            shouldTrackDriver ? displayedDriverPosition : null,
          ].filter(Boolean)}
          markers={mapMarkers}
          polylines={[
            routePath.length > 0 && {
              id: "rider-route",
              path: routePath,
              color: "#111827",
              weight: 5,
              opacity: 0.82,
              animated: Boolean(currentRide),
            },
            shouldTrackDriver &&
              displayedDriverPosition && {
                id: "live-driver-route",
                path: liveDriverRoute.length
                  ? liveDriverRoute
                  : [displayedDriverPosition, trackingTarget],
                color: "#2563eb",
                weight: 5,
                opacity: 0.72,
                animated: true,
              },
          ].filter(Boolean)}
        />

        {currentRide && (
          <div className="sx-live-hud">
            <span>{activeStatus}</span>
            <strong>
              {liveTrackingEta
                ? `${liveTrackingEta} min`
                : routeInfo
                  ? `${routeInfo.etaMinutes} min`
                  : "--"}
            </strong>
            <small>
              {liveTrackingDistance
                ? `${liveTrackingDistance.toFixed(1)} km away`
                : `${distance || 0} km trip`}
            </small>
          </div>
        )}

        <div style={topOverlayStyle}>
          <button
            type="button"
            onClick={() => setShowAccountPanel((current) => !current)}
            style={roundButtonStyle}
            aria-label="Account"
          >
            {riderIdentity.profile_picture ? (
              <img src={riderIdentity.profile_picture} alt="Rider" style={accountPhotoStyle} />
            ) : (
              "!"
            )}
          </button>
          <div style={locationPillStyle}>
            <img src={logoSrc} alt={`${MARKET.brandName} logo`} style={locationLogoStyle} />
            <strong>{city}</strong>
            <span>{activeStatus}</span>
          </div>
          <label style={languageControlStyle}>
            <span>{t("settings.language")}</span>
            <select
              aria-label={t("settings.language")}
              value={currentLanguage}
              onChange={changeLanguage}
              style={languageSelectStyle}
            >
              {languageOptions.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.nativeName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={logoutRider}
            style={topLogoutButtonStyle}
          >
            {t("riderDashboard.logout")}
          </button>
          <button
            type="button"
            onClick={() => setShowSafetyPanel((current) => !current)}
            style={{
              ...roundButtonStyle,
              ...sosButtonStyle,
            }}
            aria-label="Emergency SOS"
          >
            SOS
          </button>
          <button
            type="button"
            onClick={shareTrip}
            disabled={!currentRide}
            style={{
              ...roundButtonStyle,
              opacity: currentRide ? 1 : 0.45,
            }}
            aria-label="Share trip"
          >
            ↗
          </button>
        </div>

        <div style={floatingSummaryStyle}>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>{t("riderDashboard.estimatedFare")}</span>
            <strong>{destination && destination !== pickup && distance > 0 ? formatMoney(fare) : "---"}</strong>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>
              {shouldTrackDriver ? t("riderDashboard.liveEta") : t("riderDashboard.eta")}
            </span>
            <strong>
              {liveTrackingEta
                ? `${liveTrackingEta} min`
                : routeInfo
                  ? `${routeInfo.etaMinutes} min`
                  : "--"}
            </strong>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>
              {shouldTrackDriver ? t("riderDashboard.liveDistance") : t("riderDashboard.distance")}
            </span>
            <strong>
              {liveTrackingDistance
                ? `${liveTrackingDistance.toFixed(1)} km`
                : `${distance || 0} km`}
            </strong>
          </div>
        </div>
      </section>

      <section className="sx-rider-bottom-sheet" style={sheetStyle}>
        <div style={sheetHandleStyle} />

        <section style={bookingHeroStyle}>
          <div>
            <span style={tinyLabelStyle}>{t("riderDashboard.brand")}</span>
            <h1 style={bookingTitleStyle}>
              {currentRide ? activeStatus : t("riderDashboard.whereTo")}
            </h1>
            <p style={bookingSubtitleStyle}>
              {currentRide
                ? `${selectedRideLabel} · ${liveTrackingEta || routeInfo?.etaMinutes || "--"} min ETA`
                : t("riderDashboard.bookingSubtitle")}
            </p>
          </div>
          <div style={bookingFarePillStyle}>
            <span>{t("riderDashboard.estimate")}</span>
            <strong>{destination && destination !== pickup && distance > 0 ? formatMoney(fare) : "---"}</strong>
          </div>
        </section>

        {/* PIN section moved inside Active Ride Container (Task 4) - only shows for driver_arriving/driver_arrived */}

        <nav style={quickLinksStyle} aria-label="Rider shortcuts">
          {riderQuickLinks.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => openQuickLink(item)}
              style={{
                ...quickLinkButtonStyle,
                ...(item.action === "logout" ? quickLogoutButtonStyle : {}),
              }}
            >
              {item.label || t(`riderDashboard.${item.key}`)}
            </button>
          ))}
        </nav>

        {showAccountPanel && (
          <form onSubmit={saveRiderIdentity} style={accountPanelStyle}>
            {/* Yala Rider Logo */}
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <img src={logoSrc} alt="Yala" style={{ width: 64, height: 64, borderRadius: "50%", boxShadow: "0 4px 16px rgba(109,40,217,0.25)" }} />
              <div style={{ color: RIDER_PURPLE, fontWeight: 900, fontSize: 16, marginTop: 6 }}>{t("riderDashboard.brand")}</div>
              <div style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700 }}>{t("riderDashboard.tagline")}</div>
            </div>
            <div>
              <span style={tinyLabelStyle}>{t("riderDashboard.accountSecurity")}</span>
              <h2 style={panelTitleStyle}>{t("riderDashboard.riderProfile")}</h2>
            </div>
            <div style={photoStatusStyle}>
              {riderIdentity.profile_picture ? (
                <img src={riderIdentity.profile_picture} alt="Rider" style={profilePreviewStyle} />
              ) : (
                <div style={profileFallbackStyle}>R</div>
              )}
              <div>
                <strong>{t("riderDashboard.photoRequired")}</strong>
                <span style={profileHintStyle}>
                  {t("riderDashboard.photoHelp")}
                </span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setProfilePictureFile(event.target.files?.[0] || null)}
              style={fileInputStyle}
            />
            <input
              type="tel"
              value={riderIdentity.phone_number}
              onChange={(event) =>
                setRiderIdentity((current) => ({
                  ...current,
                  phone_number: event.target.value,
                }))
              }
              style={inputStyle}
              placeholder={t("riderDashboard.phonePlaceholder")}
            />
            <input
              value={riderIdentity.national_id_number}
              onChange={(event) =>
                setRiderIdentity((current) => ({
                  ...current,
                  national_id_number: event.target.value,
                }))
              }
              style={inputStyle}
              placeholder={t("riderDashboard.nationalIdPlaceholder")}
            />
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setNationalIdFile(event.target.files?.[0] || null)}
              style={fileInputStyle}
            />
            <button type="submit" disabled={identitySaving} style={secondaryActionStyle}>
              {identitySaving ? t("riderDashboard.saving") : t("riderDashboard.saveProfile")}
            </button>
            {identityMessage && <p style={noticeTextStyle}>{identityMessage}</p>}
            <button
              type="button"
              onClick={logoutRider}
              style={{
                width: "100%",
                marginTop: 12,
                minHeight: 46,
                border: "1px solid #fecaca",
                borderRadius: 999,
                background: "rgba(220,38,38,0.1)",
                color: "#ef4444",
                fontWeight: 900,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {t("riderDashboard.logout")}
            </button>
          </form>
        )}

        {/* Profile Navigation Menu (Task 4) */}
        {showAccountPanel && (
          <nav style={profileMenuNavStyle}>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/rider-profile"; }}>
              <span style={profileMenuIconStyle}>👤</span>
              <span style={profileMenuLabelStyle}>Personal Information</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/payment-setup"; }}>
              <span style={profileMenuIconStyle}>💳</span>
              <span style={profileMenuLabelStyle}>Payment Methods</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/rider-profile"; }}>
              <span style={profileMenuIconStyle}>📋</span>
              <span style={profileMenuLabelStyle}>Trip History</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/saved-places"; }}>
              <span style={profileMenuIconStyle}>📍</span>
              <span style={profileMenuLabelStyle}>Saved Places</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/notifications"; }}>
              <span style={profileMenuIconStyle}>🔔</span>
              <span style={profileMenuLabelStyle}>Notifications</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/support"; }}>
              <span style={profileMenuIconStyle}>❓</span>
              <span style={profileMenuLabelStyle}>Support</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={profileMenuItemStyle} onClick={() => { window.location.href = "/support?topic=lost"; }}>
              <span style={profileMenuIconStyle}>🧳</span>
              <span style={profileMenuLabelStyle}>Lost Items</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
            <button type="button" style={{ ...profileMenuItemStyle, borderBottom: "none", color: "#ef4444" }} onClick={() => { localStorage.removeItem("access"); localStorage.removeItem("refresh"); window.location.href = "/login"; }}>
              <span style={profileMenuIconStyle}>🚪</span>
              <span style={profileMenuLabelStyle}>Logout</span>
              <span style={profileMenuArrowStyle}>→</span>
            </button>
          </nav>
        )}

        {/* Active Ride Scrollable Container */}
        {currentRide && activeRideStatuses.has(currentRide.status) && (
          <div className="sx-active-ride-container" style={activeRideContainerStyle}>
            {/* Status Hero */}
            <section className="sx-live-trip-card" style={liveTripStyle}>
              <div style={{ flex: 1 }}>
                <span style={tinyLabelStyle}>{t("riderDashboard.currentRide")}</span>
                <h2 style={panelTitleStyle}>
                  {getStatusLabel(currentRide.status, t)}
                  {liveTrackingEta && liveTrackingEta > 0 ? ` — ${liveTrackingEta} min away` : ""}
                </h2>
                <div style={statusHeroMetaStyle}>
                  <span style={statusHeroPillStyle}>
                    {getStatusLabel(currentRide.status, t)}
                  </span>
                  <span style={rideTypeBadgeStyle}>
                    {currentRide.ride_type
                      ? currentRide.ride_type.charAt(0).toUpperCase() + currentRide.ride_type.slice(1)
                      : "Regular"}
                  </span>
                  {liveTrackingEta && liveTrackingEta > 0 && (
                    <span style={etaContextStyle}>{liveTrackingEta} min</span>
                  )}
                </div>
              </div>
            </section>

            {/* Trip Route Section - Task 3 */}
            <section className="sx-trip-route-section" style={tripRouteSectionStyle}>
              <div style={tripRouteDotStyle}>
                <span style={pickupDotActiveStyle}>●</span>
                <span style={tripRouteLineStyle}></span>
                <span style={dropoffDotActiveStyle}>◉</span>
              </div>
              <div style={tripRouteTextContainerStyle}>
                <span style={tripRouteTextStyle}>
                  {currentRide.pickup || currentRide.pickup_address || "Pickup"}
                </span>
                <span style={tripRouteTextStyle}>
                  {currentRide.destination || currentRide.destination_address || "Destination"}
                </span>
              </div>
            </section>

            {/* Pickup PIN Section - Task 4 */}
            {(currentRide.status === 'driver_arriving' || currentRide.status === 'driver_arrived') && currentRide.pickup_pin && (
              <section className="sx-pickup-pin-section" style={pinSectionStyle}>
                <span style={pinLabelStyle}>Your Pickup PIN</span>
                <div style={pinDigitRowStyle}>
                  {String(currentRide.pickup_pin).split('').map((digit, index) => (
                    <div key={index} style={pinDigitBoxStyle}>
                      {digit}
                    </div>
                  ))}
                </div>
                <span style={pinInstructionStyle}>Share this PIN with your driver at pickup</span>
              </section>
            )}

            {/* ETA & Fare Section */}
            <div style={etaFareRowStyle}>
              <div style={etaCardStyle}>
                <span style={etaValueStyle}>
                  {liveTrackingEta || routeInfo?.etaMinutes || "--"}{" "}
                  <span style={etaSubtextStyle}>min</span>
                </span>
                <span style={etaSubtextStyle}>
                  {liveTrackingDistance
                    ? Number(liveTrackingDistance).toFixed(1)
                    : distance || "--"}{" "}
                  km
                </span>
              </div>
              <div style={fareCardStyle}>
                <span style={fareValueStyle}>
                  {currentRide.status !== "completed"
                    ? formatMoney(fare || currentRide.fare || 0)
                    : formatMoney(currentRide.fare || 0)}
                </span>
                <span style={fareLabelStyle}>
                  {currentRide.status !== "completed" ? "Estimate" : "Total"}
                </span>
              </div>
            </div>

            {/* Driver Info Card */}
            {currentRide?.driver_name && (
              <section className="sx-driver-info-card" style={driverCardStyle}>
                {/* Top row: Photo + Info stack */}
                <div style={driverCardTopRowStyle}>
                  {getDriverPhoto(currentRide) ? (
                    <img src={getDriverPhoto(currentRide)} alt="Driver" style={driverPhotoStyle} />
                  ) : (
                    <div style={driverFallbackStyle}>
                      {(currentRide.driver_name || "D").slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div style={driverCardInfoStackStyle}>
                    <strong style={driverCardNameStyle}>{currentRide.driver_name}</strong>
                    <span style={driverCardRatingStyle}>
                      ★ {Number(currentRide.driver_avg_rating || currentRide.driver_rating || 5).toFixed(1)} · {currentRide.completed_trips || 0} {t("riderDashboard.trips", { defaultValue: "trips" })}
                    </span>
                    {(currentRide.driver_category_label || currentRide.driver_member_since_year) && (
                      <span style={driverCardMetaStyle}>
                        {currentRide.driver_category_label && <span>{currentRide.driver_category_label}</span>}
                        {currentRide.driver_category_label && currentRide.driver_member_since_year && <span> · </span>}
                        {currentRide.driver_member_since_year && <span>Since {currentRide.driver_member_since_year}</span>}
                      </span>
                    )}
                  </div>
                </div>

                {/* Private call hint */}
                <span style={privateCallHintStyle}>
                  {t("riderDashboard.privateCallNumber", { number: currentRide.private_call_number || MARKET.privateCallNumber })}
                </span>

                {/* Actions row: Call, Chat */}
                <div style={driverCardActionsRowStyle}>
                  {currentRide.driver_phone && (
                    <a href={`tel:${currentRide.driver_phone}`} style={callButtonStyle}>
                      {t("riderDashboard.privateCall")}
                    </a>
                  )}
                  <button type="button" onClick={() => setShowChat(true)} style={{ ...shareButtonStyle, background: RIDER_PURPLE, color: "#fff" }}>
                    {t("riderDashboard.chat")}
                  </button>
                </div>
              </section>
            )}

            {/* Vehicle Card Section - Task 7 */}
            {currentRide?.driver_name && (
              <section style={vehicleCardStyle}>
                <div style={vehicleCardTopRowStyle}>
                  <span style={vehicleCardIconStyle}>🚗</span>
                  <span style={vehicleCardDescStyle}>{getVehicleLabel(currentRide)}</span>
                </div>
                <div style={vehicleCardMetaStyle}>
                  <strong>Plate: {getPlateNumber(currentRide)}</strong>
                  {currentRide.ride_type && <span> · {currentRide.ride_type.charAt(0).toUpperCase() + currentRide.ride_type.slice(1)}</span>}
                </div>
              </section>
            )}

            {/* Actions Row - SOS, Cancel, Share */}
            <div className="sx-actions-row" style={actionsRowStyle}>
              {activeRideStatuses.has(currentRide.status) && (
                <button
                  type="button"
                  onClick={() => setShowSafetyPanel(true)}
                  style={actionsRowSosStyle}
                >
                  🆘 SOS
                </button>
              )}
              {canCancelCurrentRide && (
                <button
                  type="button"
                  onClick={() => {
                    setLastCancellation(null);
                    setCancelModalOpen(true);
                  }}
                  style={actionsRowCancelStyle}
                >
                  {t("riderDashboard.cancelRide")}
                </button>
              )}
              <button
                type="button"
                onClick={shareTrip}
                style={actionsRowShareStyle}
              >
                {t("riderDashboard.share")}
              </button>
            </div>

            {/* Cancellation refund notice */}
            {lastCancellation && (
              <section
                style={{
                  ...refundStatusStyle,
                  borderColor:
                    lastCancellation.tone === "error"
                      ? "rgba(248, 113, 113, 0.35)"
                      : lastCancellation.tone === "warning"
                        ? RIDER_PURPLE_BORDER
                        : RIDER_PURPLE_BORDER,
                }}
              >
                <div>
                  <span style={tinyLabelStyle}>{t("riderDashboard.refundStatus")}</span>
                  <strong>{lastCancellation.title}</strong>
                  <p>{lastCancellation.text}</p>
                  {lastCancellation.reason && <small>{t("riderDashboard.reason", { reason: lastCancellation.reason })}</small>}
                </div>
                {lastCancellation.fee && (
                  <span style={refundFeePillStyle}>{t("riderDashboard.fee", { fee: formatMoney(lastCancellation.fee) })}</span>
                )}
              </section>
            )}

            {/* Status Timeline */}
            <section className="sx-status-timeline" aria-label="Live ride status">
              {rideStatusSteps.map((step, index) => {
                const isDone = index < statusStepIndex;
                const isActive = index === statusStepIndex;

                return (
                  <article
                    key={step.key}
                    className={`${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                  >
                    <span>{isDone ? "✓" : index + 1}</span>
                    <div>
                      <strong>{t(`riderDashboard.timeline.${step.titleKey}`)}</strong>
                      <small>{t(`riderDashboard.timeline.${step.textKey}`)}</small>
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}

        {/* Active ride sections that render outside scrollable container (for non-active statuses like completed) */}
        {currentRide && !activeRideStatuses.has(currentRide.status) && (
          <section className="sx-live-trip-card" style={liveTripStyle}>
            <div style={{ flex: 1 }}>
              <span style={tinyLabelStyle}>{t("riderDashboard.currentRide")}</span>
              <h2 style={panelTitleStyle}>{getStatusLabel(currentRide.status, t)}</h2>
              <div style={statusHeroMetaStyle}>
                <span style={statusHeroPillStyle}>
                  {getStatusLabel(currentRide.status, t)}
                </span>
                <span style={rideTypeBadgeStyle}>
                  {currentRide.ride_type
                    ? currentRide.ride_type.charAt(0).toUpperCase() + currentRide.ride_type.slice(1)
                    : "Regular"}
                </span>
              </div>
            </div>
            <div style={rideStatusActionStyle}>
            </div>
          </section>
        )}

        {/* Cancellation notice - shown outside container when no active ride status */}
        {lastCancellation && !(currentRide && activeRideStatuses.has(currentRide.status)) && (
          <section
            style={{
              ...refundStatusStyle,
              borderColor:
                lastCancellation.tone === "error"
                  ? "rgba(248, 113, 113, 0.35)"
                  : lastCancellation.tone === "warning"
                    ? RIDER_PURPLE_BORDER
                    : RIDER_PURPLE_BORDER,
            }}
          >
            <div>
              <span style={tinyLabelStyle}>{t("riderDashboard.refundStatus")}</span>
              <strong>{lastCancellation.title}</strong>
              <p>{lastCancellation.text}</p>
              {lastCancellation.reason && <small>{t("riderDashboard.reason", { reason: lastCancellation.reason })}</small>}
            </div>
            {lastCancellation.fee && (
              <span style={refundFeePillStyle}>{t("riderDashboard.fee", { fee: formatMoney(lastCancellation.fee) })}</span>
            )}
          </section>
        )}

        {/* Chat overlay */}
        {showChat && currentRide?.id && (
          <RideChat rideId={currentRide.id} onClose={() => setShowChat(false)} />
        )}

        {showSafetyPanel && (
          <div style={safetyPanelWrapStyle}>
            <SafetyEmergencyPanel
              role="rider"
              currentRide={currentRide}
              onShareTrip={shareTrip}
              onClose={() => setShowSafetyPanel(false)}
            />
          </div>
        )}

        <section id="history" style={analyticsCardStyle}>
          <h3 style={{ margin: 0 }}>{t("riderDashboard.spendingHistory")}</h3>
          <p style={{ margin: "6px 0 14px", color: "#6b7280" }}>
            {t("riderDashboard.totalSpending")} <strong>{formatMoney(spendingHistory.total)}</strong>
          </p>
          <div style={spendingBarsStyle}>
            {(spendingHistory.trend.length ? spendingHistory.trend : [{ label: t("riderDashboard.noData"), value: 0 }]).map((item) => {
              const maxValue = Math.max(...(spendingHistory.trend.length ? spendingHistory.trend : [{ value: 1 }]).map((entry) => entry.value), 1);
              const barHeight = `${Math.max(10, (item.value / maxValue) * 80)}px`;
              return (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <div style={{ ...spendingBarStyle, height: barHeight }} />
                  <small>{item.label}</small>
                  <div style={{ fontWeight: 800, fontSize: "12px" }}>{formatMoney(item.value)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={routeEditorStyle}>
          <div style={sectionHeadStyle}>
            <span style={tinyLabelStyle}>{t("riderDashboard.search")}</span>
            <strong>{t("riderDashboard.pickupDestination")}</strong>
          </div>
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            style={citySelectStyle}
            aria-label="City"
          >
            {MARKET.cities.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>

          <div style={addressStackStyle}>
            <div style={routeDotsStyle}>
              <span style={pickupDotStyle} />
              <span style={routeLineStyle} />
              <span style={dropoffDotStyle} />
            </div>
            <div style={addressInputsStyle}>
              {!gpsLoading && !gpsError && gpsPosition && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 11, color: "#22c55e" }}>
                  <span>📍</span>
                  <span>GPS location detected</span>
                </div>
              )}
              <input
                list="mauritania-locations"
                value={pickup}
                onChange={(event) => setPickup(event.target.value)}
                placeholder={gpsLoading ? "📍 Finding your location..." : t("riderDashboard.enterPickup")}
                style={addressInputStyle}
              />
              {stops.map((stop, index) => (
                <div key={stop.id} style={stopInputRowStyle}>
                  <input
                    list="mauritania-locations"
                    value={stop.location}
                    onChange={(event) => updateRideStop(stop.id, event.target.value)}
                    placeholder={`${t("riderDashboard.addStop")} ${index + 1}`}
                    style={addressInputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeRideStop(stop.id)}
                    style={removeStopIconButtonStyle}
                    aria-label={t("riderDashboard.removeStop")}
                  >
                    ×
                  </button>
                </div>
              ))}
              <LocationInput
                label="Drop-off"
                value={destination}
                city={city}
                savedPlaces={savedPlaces}
                onSelect={(loc) => setDestination(loc.label)}
              />
            </div>
          </div>

          <div style={savedPlacesStyle} aria-label="Saved places">
            {savedPlaces.map((place) => (
              <button
                key={place.key}
                type="button"
                onClick={() => handleSavedPlace(place)}
                style={savedPlaceButtonStyle}
              >
                <span style={savedPlaceIconStyle}>{place.icon}</span>
                <span>
                  <strong>{t(`riderDashboard.${place.key}`)}</strong>
                  <small>{t(`riderDashboard.${place.detailKey}`)}</small>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={addRideStop}
            style={extraStopButtonStyle}
          >
            {t("riderDashboard.addAnotherStop")}
          </button>

          <datalist id="mauritania-locations">
            {cityLocations.map((location) => (
              <option key={location.label} value={location.label} />
            ))}
          </datalist>
        </section>

        <section style={rideOptionsStyle}>
          {(!destination || destination === pickup || distance <= 0) ? (
            <div style={fareHintStyle}>
              <span style={fareHintIcon}>📍</span>
              <p style={fareHintText}>{t("riderDashboard.selectDestinationForFare") || "Select your destination to see fare estimates."}</p>
            </div>
          ) : (
            <>
              <div style={sectionHeadStyle}>
                <span style={tinyLabelStyle}>{t("riderDashboard.chooseRide")}</span>
                <strong>{t("riderDashboard.fareBeforeBooking")}</strong>
              </div>
              {Object.keys(MARKET.fare).map((type) => {
                const selected = type === rideType;
                const optionFare = calculateFare(type, distance);
                const showFare = destination && destination !== pickup && distance > 0;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setRideType(type)}
                    style={{
                      ...rideOptionStyle,
                      borderColor: selected ? RIDER_PURPLE : "rgba(255,255,255,0.1)",
                      background: selected ? RIDER_PURPLE_SOFT : "rgba(255,255,255,0.04)",
                    }}
                  >
                    <div style={rideMarkStyle}>{rideIcons[type] || "Y"}</div>
                    <div style={rideTextStyle}>
                      <strong>{rideName(type)}</strong>
                      <span>{rideDescription(type)} · {rideSeatsLabel(type)} · {rideEtaLabel(type)}</span>
                    </div>
                    {showFare ? (
                      <strong style={farePriceStyle}>{formatMoney(optionFare)}</strong>
                    ) : (
                      <span style={fareHiddenStyle}>---</span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </section>

        {/* Payment Method Selector (Task 5) */}
        {!currentRide && (
          <div style={paymentSelectorStyle}>
            <span style={paymentSelectorIconStyle}>
              {selectedPaymentMethod?.payment_type === "card" ? "💳" : selectedPaymentMethod?.payment_type === "wallet" ? "👛" : "💵"}
            </span>
            <span style={paymentSelectorLabelStyle}>
              {selectedPaymentMethod?.display_name || "Cash"}
            </span>
            <button
              type="button"
              onClick={() => setShowPaymentPicker(!showPaymentPicker)}
              style={paymentSelectorChangeStyle}
            >
              Change
            </button>
          </div>
        )}
        {showPaymentPicker && !currentRide && (
          <div style={paymentPickerStyle}>
            {[
              { payment_type: "cash", display_name: "Cash" },
              { payment_type: "card", display_name: "Card" },
              { payment_type: "wallet", display_name: "Wallet" },
            ].map((method) => (
              <button
                key={method.payment_type}
                type="button"
                style={{
                  ...paymentPickerItemStyle,
                  background: selectedPaymentMethod?.payment_type === method.payment_type ? "rgba(139,92,246,0.2)" : "transparent",
                }}
                onClick={() => {
                  setSelectedPaymentMethod(method);
                  setShowPaymentPicker(false);
                }}
              >
                <span>{method.payment_type === "card" ? "💳" : method.payment_type === "wallet" ? "👛" : "💵"}</span>
                <span>{method.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {currentRide?.status === "completed" ? (
          <button type="button" onClick={goToPayRate} style={primaryActionStyle}>
            {t("riderDashboard.payAndRate")}
          </button>
        ) : (
          <button
            type="button"
            onClick={requestRide}
            disabled={requesting}
            style={{
              ...primaryActionStyle,
              opacity: requesting ? 0.68 : 1,
            }}
          >
            {requesting
              ? t("riderDashboard.requesting")
              : t("riderDashboard.confirmRide", { ride: selectedRideLabel, fare: formatMoney(fare) })}
          </button>
        )}

        {requestMessage && <p style={rideRequestNoticeStyle}>{requestMessage}</p>}

        {/* Schedule for later */}
        {!currentRide && (
          <ScheduleRideButton
            pickup={pickup}
            destination={destination}
            pickupPosition={pickupPosition}
            stops={stopLocations}
            destinationPosition={destinationPosition}
            distance={distance}
            rideType={rideType}
            fare={fare}
            token={token}
            hasProfile={true}
          />
        )}
      </section>

      {cancelModalOpen && (
        <div style={modalBackdropStyle} role="presentation">
          <section style={modalCardStyle} role="dialog" aria-modal="true" aria-label="Cancel ride">
            <span style={tinyLabelStyle}>{t("riderDashboard.cancelRide")}</span>
            <h2 style={modalTitleStyle}>{t("riderDashboard.cancel.title")}</h2>
            <p style={modalTextStyle}>
              {t("riderDashboard.cancel.description")}
            </p>
            <select
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              style={modalSelectStyle}
            >
              <option value="">{t("riderDashboard.cancel.selectReason")}</option>
              <option value="Driver is too far">{t("riderDashboard.cancel.tooFar")}</option>
              <option value="Changed my plans">{t("riderDashboard.cancel.changedPlans")}</option>
              <option value="Pickup location is wrong">{t("riderDashboard.cancel.wrongPickup")}</option>
              <option value="Found another ride">{t("riderDashboard.cancel.foundAnother")}</option>
              <option value="Other">{t("riderDashboard.cancel.other")}</option>
            </select>
            {lastCancellation?.tone === "warning" && (
              <p style={modalInlineNoticeStyle}>{lastCancellation.text}</p>
            )}
            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                style={modalGhostButtonStyle}
              >
                {t("riderDashboard.cancel.keepRide")}
              </button>
              <button
                type="button"
                onClick={cancelRide}
                disabled={cancelSaving}
                style={{
                  ...modalDangerButtonStyle,
                  opacity: cancelSaving ? 0.72 : 1,
                }}
              >
                {cancelSaving ? t("riderDashboard.cancel.cancelling") : t("riderDashboard.cancelRide")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function RiderTrackingStyles() {
  return (
    <style>{`
      .sx-live-ride-page {
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .sx-live-hud {
        position: absolute;
        z-index: 6;
        left: 50%;
        top: 88px;
        transform: translateX(-50%);
        min-width: 190px;
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 12px 18px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 22px;
        background: rgba(3, 7, 18, 0.88);
        color: #fff;
        box-shadow: 0 20px 44px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(14px);
        pointer-events: none;
      }

      .sx-live-hud span {
        color: #6D28D9;
        font-size: 0.72rem;
        font-weight: 950;
        text-transform: uppercase;
      }

      .sx-live-hud strong {
        font-size: 1.65rem;
        line-height: 1;
      }

      .sx-live-hud small {
        color: rgba(255,255,255,0.72);
        font-weight: 800;
      }

      .sx-status-timeline {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin: 0 0 12px;
      }

      .sx-status-timeline article {
        min-width: 0;
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        padding: 10px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.58);
      }

      .sx-status-timeline article > span {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.7);
        font-weight: 950;
      }

      .sx-status-timeline article strong,
      .sx-status-timeline article small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sx-status-timeline article strong {
        color: inherit;
        font-size: 0.86rem;
      }

      .sx-status-timeline article small {
        margin-top: 2px;
        color: rgba(255,255,255,0.48);
        font-size: 0.72rem;
        line-height: 1.25;
      }

      .sx-status-timeline article.done,
      .sx-status-timeline article.active {
        color: #fff;
        border-color: rgba(109, 40, 217, 0.34);
        background: rgba(109, 40, 217, 0.1);
      }

      .sx-status-timeline article.done > span,
      .sx-status-timeline article.active > span {
        background: #6D28D9;
        color: #111827;
      }

      .sx-driver-info-card {
        transition: transform .22s ease, border-color .22s ease;
      }

      .sx-driver-info-card:hover {
        transform: translateY(-1px);
        border-color: rgba(109, 40, 217, 0.38) !important;
      }

      @media (max-width: 720px) {
        .sx-live-map-stage {
          height: 54vh !important;
          min-height: 360px !important;
        }

        .sx-live-hud {
          top: 80px;
          min-width: 170px;
        }

        .sx-rider-bottom-sheet {
          width: 100% !important;
          min-height: 50vh !important;
          border-radius: 24px 24px 0 0 !important;
          padding-left: 14px !important;
          padding-right: 14px !important;
        }

        .sx-status-timeline {
          grid-template-columns: 1fr;
        }

        .sx-status-timeline article small {
          white-space: normal;
        }

        .sx-driver-info-card {
          align-items: flex-start !important;
          flex-wrap: wrap;
        }
      }
    `}</style>
  );
}

function ScheduleRideButton({
  pickup,
  destination,
  pickupPosition,
  stops,
  destinationPosition,
  distance,
  rideType,
  fare,
  token,
  hasProfile,
}) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const [dateTime, setDateTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [message, setMessage] = useState("");

  const scheduleRide = async () => {
    if (!hasProfile) { setMessage(t("riderDashboard.addPhonePhotoFirst")); return; }
    if (!dateTime) { setMessage(t("riderDashboard.pickDateTime")); return; }
    try {
      setScheduling(true); setMessage("");
      await riderApi.post(`${API_URL}/rides/schedule/`, {
        pickup, destination,
        pickup_lat: pickupPosition[0], pickup_lng: pickupPosition[1],
        destination_lat: destinationPosition[0], destination_lng: destinationPosition[1],
        distance_km: distance, ride_type: rideType, fare,
        scheduled_at: new Date(dateTime).toISOString(),
        stops: stops
          .filter((stop) => stop.location?.position)
          .map((stop, index) => ({
            location_name: stop.label,
            latitude: stop.location.position[0],
            longitude: stop.location.position[1],
            stop_order: index + 1,
          })),
      }, { headers: { Authorization: `Bearer ${token}` } });
      setMessage(`Ride scheduled for ${new Date(dateTime).toLocaleString()}`);
      setShowPicker(false); setDateTime("");
    } catch (err) {
      setMessage(err.response?.data?.detail || t("riderDashboard.couldNotSchedule"));
    } finally { setScheduling(false); }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => setShowPicker(!showPicker)} style={{
        width: "100%", minHeight: 44, border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 999, background: "rgba(255,255,255,0.06)", color: RIDER_PURPLE,
        fontWeight: 800, fontSize: 14, cursor: "pointer",
      }}>
        {t("riderDashboard.scheduleRide")}
      </button>
      {showPicker && (
        <div style={{ marginTop: 10, padding: 14, background: "#1a1a1a", borderRadius: 14, border: "1px solid #333" }}>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            min={new Date(Date.now() + 600000).toISOString().slice(0, 16)}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #444", background: "#262626", color: "#fff", fontSize: 14 }}
          />
          <button onClick={scheduleRide} disabled={scheduling} style={{
            width: "100%", marginTop: 10, minHeight: 44, border: 0, borderRadius: 999,
            background: RIDER_PURPLE, color: "#ffffff", fontWeight: 800, fontSize: 14, cursor: "pointer",
            opacity: scheduling ? 0.6 : 1,
          }}>
            {scheduling ? t("riderDashboard.scheduling") : t("riderDashboard.confirmSchedule")}
          </button>
          {message && <p style={{ margin: "8px 0 0", color: RIDER_PURPLE, fontSize: 13, fontWeight: 700 }}>{message}</p>}
        </div>
      )}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: YALA_NAVY,
  color: "#f8fafc",
};

const mapStageStyle = {
  position: "relative",
  height: "100vh",
  minHeight: "680px",
  background: "#0b1220",
};

const mapStyle = {
  width: "100%",
  height: "100%",
};

const topOverlayStyle = {
  position: "absolute",
  top: "18px",
  left: "18px",
  right: "18px",
  zIndex: 5,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  pointerEvents: "none",
};

const roundButtonStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 950,
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
  cursor: "pointer",
  pointerEvents: "auto",
  overflow: "hidden",
};

const sosButtonStyle = {
  width: "58px",
  borderRadius: "999px",
  background: "#dc2626",
  color: "white",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 14px 30px rgba(220, 38, 38, 0.34)",
  fontSize: "0.78rem",
};

const accountPhotoStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const locationPillStyle = {
  minHeight: "48px",
  display: "grid",
  gridTemplateColumns: "28px auto",
  columnGap: "8px",
  alignContent: "center",
  alignItems: "center",
  justifyItems: "start",
  background: "rgba(8, 17, 31, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  borderRadius: "999px",
  padding: "7px 18px",
  color: "#ffffff",
  boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(12px)",
};

const locationLogoStyle = {
  gridRow: "1 / span 2",
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  objectFit: "cover",
  boxShadow: "0 4px 12px rgba(109,40,217,0.3)",
};

const languageControlStyle = {
  minHeight: "48px",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  borderRadius: "999px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(8, 17, 31, 0.88)",
  color: "#ffffff",
  padding: "7px 10px 7px 14px",
  boxShadow: "0 12px 28px rgba(0, 0, 0, 0.22)",
  backdropFilter: "blur(12px)",
  pointerEvents: "auto",
};

const languageSelectStyle = {
  minWidth: "104px",
  minHeight: "34px",
  border: 0,
  borderRadius: "999px",
  background: "#ffffff",
  color: YALA_NAVY,
  padding: "0 10px",
  fontWeight: 900,
  cursor: "pointer",
};

const topLogoutButtonStyle = {
  minHeight: "48px",
  padding: "0 18px",
  border: "1px solid rgba(254, 202, 202, 0.7)",
  borderRadius: "999px",
  background: "rgba(220, 38, 38, 0.94)",
  color: "#ffffff",
  fontWeight: 950,
  cursor: "pointer",
  pointerEvents: "auto",
  boxShadow: "0 14px 30px rgba(220, 38, 38, 0.3)",
};

const floatingSummaryStyle = {
  position: "absolute",
  left: "50%",
  bottom: "330px",
  transform: "translateX(-50%)",
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(82px, 1fr))",
  gap: "1px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.18)",
  boxShadow: "0 18px 34px rgba(0, 0, 0, 0.3)",
};

const summaryItemStyle = {
  background: "rgba(8, 17, 31, 0.92)",
  color: "#ffffff",
  padding: "10px 14px",
  textAlign: "center",
  minWidth: "88px",
  backdropFilter: "blur(12px)",
};

const summaryLabelStyle = {
  display: "block",
  color: "rgba(255,255,255,0.62)",
  fontSize: "0.72rem",
  fontWeight: 800,
};

const sheetStyle = {
  position: "relative",
  margin: "-300px auto 0",
  zIndex: 10,
  width: "min(760px, calc(100% - 18px))",
  minHeight: "52vh",
  background: "linear-gradient(180deg, rgba(8,17,31,0.98) 0%, rgba(5,11,20,0.98) 100%)",
  borderRadius: "22px 22px 0 0",
  padding: "10px 16px 24px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderBottom: "none",
  boxShadow: "0 -18px 44px rgba(0, 0, 0, 0.34)",
  boxSizing: "border-box",
};

const sheetHandleStyle = {
  width: "54px",
  height: "5px",
  borderRadius: "999px",
  background: "#d0d5dd",
  margin: "0 auto 16px",
};

const tinyLabelStyle = {
  display: "block",
  color: "rgba(255,255,255,0.58)",
  fontSize: "0.74rem",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const panelTitleStyle = {
  margin: "3px 0 0",
  color: "#ffffff",
  fontSize: "1.25rem",
};

const bookingHeroStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "14px",
  alignItems: "center",
  marginBottom: "14px",
};

const bookingTitleStyle = {
  margin: "4px 0 0",
  color: "#ffffff",
  fontSize: "clamp(1.65rem, 4vw, 2.25rem)",
  lineHeight: 1.05,
  letterSpacing: 0,
};

const bookingSubtitleStyle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,0.68)",
  lineHeight: 1.45,
  fontWeight: 650,
};

const bookingFarePillStyle = {
  minWidth: "116px",
  borderRadius: "18px",
  padding: "12px 14px",
  background: `linear-gradient(135deg, ${RIDER_PURPLE}, ${YALA_GOLD})`,
  color: YALA_NAVY,
  boxShadow: "0 18px 30px rgba(0,166,81,0.22)",
  textAlign: "right",
};

const quickLinksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
  gap: "8px",
  marginBottom: "14px",
};

const quickLinkButtonStyle = {
  minHeight: "42px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.07)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const quickLogoutButtonStyle = {
  border: "1px solid rgba(254, 202, 202, 0.74)",
  background: "rgba(220, 38, 38, 0.18)",
  color: "#fecaca",
};

const sectionHeadStyle = {
  display: "grid",
  gap: "2px",
  marginBottom: "2px",
};

const accountPanelStyle = {
  display: "grid",
  gap: "10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  padding: "14px",
  marginBottom: "12px",
};

const inputStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "0 12px",
  boxSizing: "border-box",
  fontSize: "1rem",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
};

const fileInputStyle = {
  color: "#344054",
  fontWeight: 800,
};

const secondaryActionStyle = {
  minHeight: "44px",
  border: "none",
  borderRadius: "8px",
  background: RIDER_PURPLE,
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const noticeTextStyle = {
  margin: 0,
  color: "#166534",
  fontWeight: 800,
};

const photoStatusStyle = {
  display: "grid",
  gridTemplateColumns: "54px 1fr",
  gap: "12px",
  alignItems: "center",
};

const profilePreviewStyle = {
  width: "54px",
  height: "54px",
  borderRadius: "50%",
  objectFit: "cover",
};

const profileFallbackStyle = {
  width: "54px",
  height: "54px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#111827",
  color: "#ffffff",
  fontWeight: 950,
};

const profileHintStyle = {
  display: "block",
  color: "#667085",
  fontSize: "0.86rem",
  fontWeight: 700,
  marginTop: "2px",
};

const liveTripStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "10px 0 12px",
};

const rideStatusActionStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
};

const statusPillStyle = {
  borderRadius: "999px",
  background: RIDER_PURPLE_SOFT,
  color: "#ddd6fe",
  padding: "8px 11px",
  fontWeight: 900,
  textTransform: "capitalize",
};

const statusHeroMetaStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "6px",
  flexWrap: "wrap",
};

const statusHeroPillStyle = {
  borderRadius: "999px",
  background: RIDER_PURPLE_SOFT,
  color: RIDER_PURPLE,
  padding: "5px 12px",
  fontSize: "14px",
  fontWeight: 700,
  textTransform: "capitalize",
};

const rideTypeBadgeStyle = {
  borderRadius: "999px",
  background: "rgba(243, 189, 52, 0.15)",
  color: YALA_GOLD,
  padding: "4px 10px",
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "capitalize",
};

const etaContextStyle = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#a3e635",
};

const cancelRideButtonStyle = {
  minHeight: "38px",
  border: "1px solid rgba(248, 113, 113, 0.34)",
  borderRadius: "999px",
  background: "rgba(127, 29, 29, 0.42)",
  color: "#fecaca",
  padding: "0 13px",
  fontWeight: 900,
  cursor: "pointer",
};

const refundStatusStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "13px",
  border: `1px solid ${RIDER_PURPLE_BORDER}`,
  borderRadius: "16px",
  background: "rgba(255,255,255,0.06)",
  marginBottom: "12px",
};

const refundFeePillStyle = {
  borderRadius: "999px",
  background: RIDER_PURPLE_SOFT,
  color: "#ddd6fe",
  padding: "8px 11px",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const driverCardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "14px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  marginBottom: "12px",
  color: "#ffffff",
};

const driverCardTopRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const driverCardInfoStackStyle = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gap: "2px",
};

const driverCardNameStyle = {
  fontSize: "1.08rem",
  fontWeight: 900,
};

const driverCardRatingStyle = {
  fontSize: "0.9rem",
  color: YALA_GOLD,
  fontWeight: 700,
};

const driverCardMetaStyle = {
  fontSize: "0.82rem",
  color: "rgba(255,255,255,0.62)",
  fontWeight: 600,
};

const driverCardActionsRowStyle = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
};

const activeRideSosButtonStyle = {
  position: "fixed",
  right: "18px",
  bottom: "86px",
  zIndex: 1200,
  width: "64px",
  height: "64px",
  border: "3px solid #fff",
  borderRadius: "50%",
  background: "#dc2626",
  color: "#fff",
  fontWeight: 950,
  fontSize: "18px",
  boxShadow: "0 12px 32px rgba(220, 38, 38, 0.45)",
  cursor: "pointer",
};

const actionsRowStyle = {
  display: "flex",
  gap: "10px",
  justifyContent: "center",
  alignItems: "center",
  padding: "12px 0",
  flexWrap: "wrap",
};

const actionsRowSosStyle = {
  minWidth: "90px",
  minHeight: "42px",
  border: "2px solid #dc2626",
  borderRadius: "999px",
  background: "rgba(220, 38, 38, 0.18)",
  color: "#fca5a5",
  fontWeight: 950,
  fontSize: "0.95rem",
  cursor: "pointer",
  padding: "0 16px",
};

const actionsRowCancelStyle = {
  minWidth: "110px",
  minHeight: "42px",
  border: "1px solid rgba(248, 113, 113, 0.34)",
  borderRadius: "999px",
  background: "rgba(127, 29, 29, 0.32)",
  color: "#fecaca",
  fontWeight: 900,
  fontSize: "0.9rem",
  cursor: "pointer",
  padding: "0 16px",
};

const actionsRowShareStyle = {
  minWidth: "100px",
  minHeight: "42px",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "0.9rem",
  cursor: "pointer",
  padding: "0 16px",
};

const activeRideContainerStyle = {
  overflowY: "auto",
  maxHeight: "calc(100vh - 120px)",
  padding: "4px 0 12px",
  display: "grid",
  gap: "12px",
};

const safetyPanelWrapStyle = {
  marginBottom: "12px",
};

const driverPhotoStyle = {
  width: "58px",
  height: "58px",
  borderRadius: "50%",
  objectFit: "cover",
};

const driverFallbackStyle = {
  width: "58px",
  height: "58px",
  borderRadius: "50%",
  background: "#111827",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};


const privateCallHintStyle = {
  color: "rgba(255,255,255,0.58)",
  fontSize: "0.82rem",
  fontWeight: 800,
};


const callButtonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "36px",
  borderRadius: "999px",
  padding: "0 12px",
  background: RIDER_PURPLE,
  color: "#111827",
  fontWeight: 900,
  textDecoration: "none",
};

const shareButtonStyle = {
  minHeight: "36px",
  border: "none",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const routeEditorStyle = {
  display: "grid",
  gap: "12px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  padding: "14px",
  background: "rgba(255,255,255,0.055)",
};

const citySelectStyle = {
  width: "100%",
  minHeight: "48px",
  border: "2px solid rgba(255,255,255,0.15)",
  borderRadius: "12px",
  background: "#1a1a1a",
  color: "#ffffff",
  padding: "0 14px",
  fontWeight: 800,
  fontSize: "15px",
  appearance: "auto",
  WebkitAppearance: "menulist",
};

const addressStackStyle = {
  display: "grid",
  gridTemplateColumns: "28px 1fr",
  gap: "8px",
  alignItems: "stretch",
};

const routeDotsStyle = {
  display: "grid",
  justifyItems: "center",
  padding: "12px 0",
};

const pickupDotStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "50%",
  background: RIDER_PURPLE,
};

const dropoffDotStyle = {
  width: "10px",
  height: "10px",
  background: YALA_GOLD,
};

const routeLineStyle = {
  width: "2px",
  minHeight: "40px",
  background: "#d0d5dd",
};

const addressInputsStyle = {
  display: "grid",
  gap: "8px",
};

const stopInputRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 44px",
  gap: "8px",
  alignItems: "center",
};

const removeStopIconButtonStyle = {
  width: "44px",
  height: "44px",
  border: "1px solid rgba(248, 113, 113, 0.32)",
  borderRadius: "50%",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
  fontSize: "1.4rem",
  fontWeight: 950,
  cursor: "pointer",
};

const extraStopButtonStyle = {
  width: "100%",
  minHeight: "42px",
  border: `1px solid ${RIDER_PURPLE_BORDER}`,
  borderRadius: "999px",
  background: RIDER_PURPLE_SOFT,
  color: "#ddd6fe",
  fontWeight: 900,
  cursor: "pointer",
};

const addressInputStyle = {
  width: "100%",
  minHeight: "48px",
  border: "none",
  borderRadius: "8px",
  background: "rgba(255,255,255,0.07)",
  padding: "0 14px",
  boxSizing: "border-box",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "1rem",
};

const savedPlacesStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "8px",
};

const savedPlaceButtonStyle = {
  minHeight: "68px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr)",
  gap: "8px",
  alignItems: "center",
  padding: "9px",
  textAlign: "left",
  cursor: "pointer",
};

const savedPlaceIconStyle = {
  width: "34px",
  height: "34px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(0,166,81,0.18)",
  color: YALA_GOLD,
  fontWeight: 950,
};

const rideOptionsStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "14px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  padding: "14px",
  background: "rgba(255,255,255,0.055)",
};

const analyticsCardStyle = {
  marginTop: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
};

const spendingBarsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(56px, 1fr))",
  gap: "8px",
  alignItems: "end",
};

const spendingBarStyle = {
  background: "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)",
  borderRadius: "8px 8px 4px 4px",
};

const rideOptionStyle = {
  minHeight: "76px",
  border: "2px solid rgba(255,255,255,0.1)",
  borderRadius: "16px",
  display: "grid",
  gridTemplateColumns: "48px 1fr auto",
  gap: "12px",
  alignItems: "center",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
  color: "#ffffff",
};

const rideMarkStyle = {
  width: "42px",
  height: "42px",
  borderRadius: "14px",
  background: `linear-gradient(135deg, ${YALA_NAVY}, ${RIDER_PURPLE})`,
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};

const rideTextStyle = {
  display: "grid",
  gap: "3px",
};

const farePriceStyle = {
  color: "#00A651",
  fontSize: "1rem",
};

const fareHiddenStyle = {
  color: "rgba(255,255,255,0.3)",
  fontSize: "0.9rem",
};

const fareHintStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "14px 16px",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  marginBottom: "12px",
};

const fareHintIcon = {
  fontSize: "24px",
};

const fareHintText = {
  margin: 0,
  color: "rgba(255,255,255,0.6)",
  fontSize: "0.88rem",
  fontWeight: 600,
};

const primaryActionStyle = {
  width: "100%",
  minHeight: "54px",
  marginTop: "14px",
  border: "none",
  borderRadius: "999px",
  background: RIDER_PURPLE,
  color: "#111827",
  fontWeight: 950,
  fontSize: "1.05rem",
  cursor: "pointer",
};

const rideRequestNoticeStyle = {
  margin: "10px 0 0",
  border: `1px solid ${RIDER_PURPLE_BORDER}`,
  borderRadius: "14px",
  padding: "10px 12px",
  background: RIDER_PURPLE_SOFT,
  color: "#d1fae5",
  fontWeight: 850,
  lineHeight: 1.4,
};

const pickupPinCardStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "7px",
  margin: "0 0 14px",
  padding: "16px",
  border: `1px solid ${RIDER_PURPLE_BORDER}`,
  borderRadius: "18px",
  background: "rgba(0, 166, 81, 0.14)",
  color: "#ffffff",
  textAlign: "center",
};

const pickupPinEyebrowStyle = {
  color: "#fde68a",
  fontSize: "0.78rem",
  fontWeight: 950,
  textTransform: "uppercase",
};

const pickupPinValueStyle = {
  color: "#ffffff",
  fontSize: "2rem",
  fontWeight: 950,
  letterSpacing: 0,
};

const pickupPinRiderHelpStyle = {
  color: "rgba(255,255,255,0.72)",
  fontSize: "0.82rem",
  fontWeight: 750,
  lineHeight: 1.45,
};

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "18px",
  background: "rgba(3, 7, 18, 0.72)",
  backdropFilter: "blur(10px)",
};

const modalCardStyle = {
  width: "min(440px, 100%)",
  borderRadius: "22px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "linear-gradient(180deg, #111827 0%, #030712 100%)",
  color: "#ffffff",
  padding: "20px",
  boxShadow: "0 26px 70px rgba(0, 0, 0, 0.42)",
};

const modalTitleStyle = {
  margin: "4px 0 8px",
  fontSize: "1.45rem",
};

const modalTextStyle = {
  margin: "0 0 14px",
  color: "rgba(255,255,255,0.68)",
  lineHeight: 1.5,
};

const modalSelectStyle = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0b1220",
  color: "#ffffff",
  padding: "0 12px",
  fontWeight: 850,
};

const modalInlineNoticeStyle = {
  margin: "12px 0 0",
  color: "#fde68a",
  fontWeight: 850,
};

const modalActionsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "16px",
};

const modalGhostButtonStyle = {
  minHeight: "46px",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const modalDangerButtonStyle = {
  minHeight: "46px",
  border: "none",
  borderRadius: "999px",
  background: "#dc2626",
  color: "#ffffff",
  fontWeight: 950,
  cursor: "pointer",
};

const tripRouteSectionStyle = {
  display: "grid",
  gridTemplateColumns: "28px 1fr",
  gap: "10px",
  alignItems: "stretch",
  padding: "14px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
};

const tripRouteDotStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0px",
};

const pickupDotActiveStyle = {
  color: "#22c55e",
  fontSize: "16px",
  lineHeight: "1",
};

const dropoffDotActiveStyle = {
  color: "#ef4444",
  fontSize: "16px",
  lineHeight: "1",
};

const tripRouteLineStyle = {
  width: "2px",
  minHeight: "24px",
  background: "rgba(255,255,255,0.25)",
};

const tripRouteTextContainerStyle = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "12px",
};

const tripRouteTextStyle = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "1.3",
};

const pinSectionStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "10px",
  padding: "18px 16px",
  background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
  border: "1px solid rgba(243, 189, 52, 0.35)",
  borderRadius: "18px",
};

const pinLabelStyle = {
  color: "#F3BD34",
  fontSize: "13px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const pinDigitRowStyle = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
};

const pinDigitBoxStyle = {
  width: "40px",
  height: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(243, 189, 52, 0.15)",
  border: "2px solid #F3BD34",
  borderRadius: "10px",
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 900,
};

const pinInstructionStyle = {
  color: "rgba(255, 255, 255, 0.7)",
  fontSize: "12px",
  fontWeight: 500,
  textAlign: "center",
};


const etaFareRowStyle = {
  display: "flex",
  flexDirection: "row",
  gap: "12px",
  width: "100%",
};

const etaCardStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  padding: "14px 12px",
  background: "rgba(0, 166, 81, 0.08)",
  border: "1px solid rgba(0, 166, 81, 0.25)",
  borderRadius: "14px",
};

const fareCardStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  padding: "14px 12px",
  background: "rgba(243, 189, 52, 0.08)",
  border: "1px solid rgba(243, 189, 52, 0.25)",
  borderRadius: "14px",
};

const etaValueStyle = {
  fontSize: "20px",
  fontWeight: 800,
  color: "#ffffff",
};

const etaSubtextStyle = {
  fontSize: "13px",
  fontWeight: 500,
  color: "rgba(255, 255, 255, 0.65)",
};

const fareValueStyle = {
  fontSize: "20px",
  fontWeight: 800,
  color: "#ffffff",
};

const fareLabelStyle = {
  fontSize: "13px",
  fontWeight: 500,
  color: "rgba(255, 255, 255, 0.65)",
};

const vehicleCardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "14px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  marginBottom: "12px",
  color: "#ffffff",
};

const vehicleCardTopRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const vehicleCardIconStyle = {
  fontSize: "1.5rem",
  lineHeight: 1,
};

const vehicleCardDescStyle = {
  fontSize: "1.05rem",
  fontWeight: 800,
  color: "#ffffff",
};

const vehicleCardMetaStyle = {
  fontSize: "0.88rem",
  color: "rgba(255,255,255,0.68)",
  fontWeight: 600,
  paddingLeft: "34px",
};


// Profile Menu styles (Task 4)
const profileMenuNavStyle = {
  display: "flex",
  flexDirection: "column",
  background: "rgba(255,255,255,0.04)",
  borderRadius: 12,
  overflow: "hidden",
  marginTop: 16,
};
const profileMenuItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "#f1f5f9",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
};
const profileMenuIconStyle = { fontSize: 18, width: 24, textAlign: "center" };
const profileMenuLabelStyle = { flex: 1 };
const profileMenuArrowStyle = { color: "#64748b", fontSize: 14 };

// Payment Selector styles (Task 5)
const paymentSelectorStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  background: "rgba(255,255,255,0.06)",
  borderRadius: 10,
  marginBottom: 10,
};
const paymentSelectorIconStyle = { fontSize: 20 };
const paymentSelectorLabelStyle = { flex: 1, fontWeight: 700, color: "#f1f5f9", fontSize: 14 };
const paymentSelectorChangeStyle = {
  border: "1px solid rgba(139,92,246,0.4)",
  borderRadius: 8,
  padding: "4px 12px",
  background: "transparent",
  color: "#a78bfa",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
const paymentPickerStyle = {
  display: "flex",
  gap: 8,
  padding: "8px 0",
  marginBottom: 10,
};
const paymentPickerItemStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  padding: "10px 8px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f1f5f9",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

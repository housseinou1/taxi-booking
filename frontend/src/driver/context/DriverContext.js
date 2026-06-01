import React, { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { EmergencySupportButton } from "../DriverSupport";

/**
 * DriverContext provides shared state for the premium driver app.
 *
 * State includes:
 * - isOnline: driver availability status
 * - activeRide: current active ride object or null
 * - driverLevel: level info { level, progress, benefits }
 * - notifications: { items: [], unreadCount: 0 }
 * - driverProfile: driver profile data
 * - connectionStatus: { isConnected, error }
 */

const DriverContext = createContext(null);

// Action types
export const DRIVER_ACTIONS = {
  SET_ONLINE: "SET_ONLINE",
  SET_ACTIVE_RIDE: "SET_ACTIVE_RIDE",
  SET_DRIVER_LEVEL: "SET_DRIVER_LEVEL",
  ADD_NOTIFICATION: "ADD_NOTIFICATION",
  MARK_NOTIFICATIONS_READ: "MARK_NOTIFICATIONS_READ",
  SET_NOTIFICATIONS: "SET_NOTIFICATIONS",
  SET_DRIVER_PROFILE: "SET_DRIVER_PROFILE",
  SET_CONNECTION_STATUS: "SET_CONNECTION_STATUS",
  RESET_STATE: "RESET_STATE",
};

const initialState = {
  isOnline: false,
  activeRide: null,
  driverLevel: {
    level: "bronze",
    progress: 0,
    benefits: [],
  },
  notifications: {
    items: [],
    unreadCount: 0,
  },
  driverProfile: null,
  connectionStatus: {
    isConnected: false,
    error: null,
  },
};

function driverReducer(state, action) {
  switch (action.type) {
    case DRIVER_ACTIONS.SET_ONLINE:
      return {
        ...state,
        isOnline: action.payload,
      };

    case DRIVER_ACTIONS.SET_ACTIVE_RIDE:
      return {
        ...state,
        activeRide: action.payload,
      };

    case DRIVER_ACTIONS.SET_DRIVER_LEVEL:
      return {
        ...state,
        driverLevel: {
          ...state.driverLevel,
          ...action.payload,
        },
      };

    case DRIVER_ACTIONS.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: {
          items: [action.payload, ...state.notifications.items],
          unreadCount: state.notifications.unreadCount + 1,
        },
      };

    case DRIVER_ACTIONS.MARK_NOTIFICATIONS_READ:
      return {
        ...state,
        notifications: {
          ...state.notifications,
          unreadCount: 0,
        },
      };

    case DRIVER_ACTIONS.SET_NOTIFICATIONS:
      return {
        ...state,
        notifications: {
          items: action.payload.items || state.notifications.items,
          unreadCount:
            action.payload.unreadCount !== undefined
              ? action.payload.unreadCount
              : state.notifications.unreadCount,
        },
      };

    case DRIVER_ACTIONS.SET_DRIVER_PROFILE:
      return {
        ...state,
        driverProfile: action.payload,
      };

    case DRIVER_ACTIONS.SET_CONNECTION_STATUS:
      return {
        ...state,
        connectionStatus: {
          ...state.connectionStatus,
          ...action.payload,
        },
      };

    case DRIVER_ACTIONS.RESET_STATE:
      return { ...initialState };

    default:
      return state;
  }
}

/**
 * DriverProvider wraps the driver app and provides shared state.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {Object} [props.initialValues] - Optional initial state overrides
 */
export function DriverProvider({ children, initialValues }) {
  const [state, dispatch] = useReducer(driverReducer, {
    ...initialState,
    ...initialValues,
  });

  const setOnline = useCallback((isOnline) => {
    dispatch({ type: DRIVER_ACTIONS.SET_ONLINE, payload: isOnline });
  }, []);

  const setActiveRide = useCallback((ride) => {
    dispatch({ type: DRIVER_ACTIONS.SET_ACTIVE_RIDE, payload: ride });
  }, []);

  const setDriverLevel = useCallback((levelInfo) => {
    dispatch({ type: DRIVER_ACTIONS.SET_DRIVER_LEVEL, payload: levelInfo });
  }, []);

  const addNotification = useCallback((notification) => {
    dispatch({ type: DRIVER_ACTIONS.ADD_NOTIFICATION, payload: notification });
  }, []);

  const markNotificationsRead = useCallback(() => {
    dispatch({ type: DRIVER_ACTIONS.MARK_NOTIFICATIONS_READ });
  }, []);

  const setNotifications = useCallback((notifications) => {
    dispatch({ type: DRIVER_ACTIONS.SET_NOTIFICATIONS, payload: notifications });
  }, []);

  const setDriverProfile = useCallback((profile) => {
    dispatch({ type: DRIVER_ACTIONS.SET_DRIVER_PROFILE, payload: profile });
  }, []);

  const setConnectionStatus = useCallback((status) => {
    dispatch({ type: DRIVER_ACTIONS.SET_CONNECTION_STATUS, payload: status });
  }, []);

  const resetState = useCallback(() => {
    dispatch({ type: DRIVER_ACTIONS.RESET_STATE });
  }, []);

  const actions = useMemo(
    () => ({
      setOnline,
      setActiveRide,
      setDriverLevel,
      addNotification,
      markNotificationsRead,
      setNotifications,
      setDriverProfile,
      setConnectionStatus,
      resetState,
    }),
    [
      setOnline,
      setActiveRide,
      setDriverLevel,
      addNotification,
      markNotificationsRead,
      setNotifications,
      setDriverProfile,
      setConnectionStatus,
      resetState,
    ]
  );

  const contextValue = useMemo(
    () => ({
      state,
      dispatch,
      ...actions,
    }),
    [state, actions]
  );

  return (
    <DriverContext.Provider value={contextValue}>
      {children}
      <EmergencySupportButton />
    </DriverContext.Provider>
  );
}

/**
 * Hook to access the driver context.
 * Must be used within a DriverProvider.
 *
 * @returns {Object} { state, dispatch, setOnline, setActiveRide, ... }
 */
export function useDriverContext() {
  const context = useContext(DriverContext);
  if (!context) {
    throw new Error("useDriverContext must be used within a DriverProvider");
  }
  return context;
}

export default DriverContext;

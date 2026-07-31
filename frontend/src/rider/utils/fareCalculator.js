// Re-export the central market fare calculator.
// All pricing constants live in backend/taxi/taxi/market.py; this is a pure
// client-side fallback for offline/demo screens. Live estimates use
// services/apiService.estimateFare() via the useFareEstimates hook.
export { calculateFare } from '../../marketConfig';

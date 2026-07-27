/**
 * YALA Driver UI component aliases
 * Thin re-exports over the shared design-system for Driver-specific naming.
 */
export {
  Button as PrimaryButton,
  Button as SecondaryButton,
  Button as IconButton,
  Card as DriverCard,
  Section as DriverSection,
  StatusChip,
  Kpi as StatCard,
  SettingsRow,
  EmptyState,
  ErrorState,
  LoadingState as LoadingSkeleton,
  Dialog as ConfirmationDialog,
  BottomSheet,
  Snackbar,
  ProfileCard as ProfileHeader,
  VehicleCard,
  DocumentCard,
  TripCard,
  StatisticCard as EarningsCard,
  AppBar as DriverAppBar,
  Page as DriverPage,
  Avatar,
  ListRow,
  Icon,
} from "../../design-system";

export { default as DriverShell } from "../components/DriverShell";
export { default as DriverNavigation } from "../DriverNavigation";

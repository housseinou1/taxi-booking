/**
 * YALA Admin shared component library — barrel export
 * Import from `admin/components/library` in role dashboards.
 */

import "./adminComponents.css";

// KPI
export { default as KPICard } from "./kpi/KPICard";
export { default as KPITrendCard } from "./kpi/KPITrendCard";
export { default as MetricTile } from "./kpi/MetricTile";
export { default as PercentageIndicator } from "./kpi/PercentageIndicator";
export { default as StatusChip } from "./kpi/StatusChip";

// Tables
export { default as DataTable, DataTableAction } from "./tables/DataTable";

// Charts
export {
  default as ChartShell,
  LineChart,
  BarChart,
  AreaChart,
  PieChart,
  DonutChart,
  HeatmapChart,
  TimeSeriesChart,
} from "./charts/ChartComponents";

// Approval
export {
  default as ApprovalCard,
  ApprovalQueue,
  ApprovalTimeline,
  ApprovalDialog,
} from "./approval/ApprovalComponents";

// Audit
export {
  AuditTimeline,
  AuditViewer,
  ChangeDiff,
  ActivityFeed,
} from "./audit/AuditComponents";

// Maps
export {
  default as LiveMap,
  DriverMarker,
  RideMarker,
  DeliveryMarker,
  HeatmapOverlay,
  MapLegend,
  MapToolbar,
  MapFilters,
} from "./maps/MapComponents";

// Forms
export {
  default as SearchBar,
  FilterBar,
  DateRangePicker,
  Select,
  Autocomplete,
  Drawer,
  Modal,
  ConfirmationDialog,
  MultiStepForm,
} from "./forms/FormComponents";

// Feedback
export { ToastProvider, useToast } from "./feedback/Toast";
export { default as AlertBanner, SuccessBanner, WarningBanner } from "./feedback/AlertBanner";
export { default as InlineError } from "./feedback/InlineError";
export { default as RetryBlock } from "./feedback/RetryBlock";
export {
  AdminSkeleton,
  CardSkeleton,
  ChartSkeleton,
  DashboardSkeleton,
  FormSkeleton,
  TableSkeleton,
} from "./feedback/skeletons";

// Export
export { default as ExportMenu, useExportAction } from "./export/ExportMenu";

// Utils
export * from "./utils/formatters";
export * from "./utils/exportUtils";

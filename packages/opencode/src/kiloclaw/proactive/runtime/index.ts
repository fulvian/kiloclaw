/**
 * Daemon Runtime - Barrel exports
 */

export { DaemonRuntime } from "./daemon"
export { isSystemd, notifyReady, notifyStopping, notifyWatchdog, notifyStatus } from "./notify"
export { checkAllServices, formatServiceWarnings, type ServiceHealth, type ServiceCheckResult } from "./service-manager"
export type { DaemonConfig, DaemonFeatureFlags, DaemonHealthSnapshot, DaemonMetrics, DaemonState } from "./types"

/**
 * SafeBus Alberta — Shared UI component library entry point.
 *
 * Per UI Plan §10: 19 core components. This package exports all of them.
 * Components are added incrementally as needed by the build phases.
 */

export * from './theme/index.ts';

// Core components (Phase 0/1)
export { Button } from './components/button/index.tsx';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/button/index.tsx';

export { Card } from './components/card/index.tsx';
export type { CardProps } from './components/card/index.tsx';

export { StatusBadge } from './components/status-badge/index.tsx';
export type { StatusBadgeProps } from './components/status-badge/index.tsx';

export { EmptyState } from './components/empty-state/index.tsx';
export type { EmptyStateProps } from './components/empty-state/index.tsx';

export { LoadingState } from './components/loading-state/index.tsx';
export type { LoadingStateProps } from './components/loading-state/index.tsx';

export { ErrorState } from './components/error-state/index.tsx';
export type { ErrorStateProps } from './components/error-state/index.tsx';

// TODO (Phase 1): AlertBanner, DashboardMetricCard, TripStatusPill, BusStatusCard,
//                  Timeline, DataTable, FormField, SearchInput, Sidebar, MobileHeader,
//                  MapPanel, NotificationCard, DriverActionButton

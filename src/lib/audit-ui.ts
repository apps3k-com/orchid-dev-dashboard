type BadgeVariant = "destructive" | "secondary" | "outline";

/** Badge variant per finding severity (shared by the single-repo audit page + /audits). */
export const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
  info: "outline",
};

/** Badge variant per audit run status. */
export const STATUS_VARIANT: Record<string, BadgeVariant> = {
  completed: "secondary",
  failed: "destructive",
  running: "outline",
  pending: "outline",
};

/** Badge variant for a finding severity (falls back to `outline`). */
export function severityVariant(severity: string): BadgeVariant {
  return SEVERITY_VARIANT[severity] ?? "outline";
}

/** Badge variant for an audit run status (falls back to `outline`). */
export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status] ?? "outline";
}

/** Percent (0–100, rounded) of a batch's audits that have reached a terminal state (completed or
 *  failed) — drives the /audits progress bar. An empty batch (0 total) is 0%. */
export function progressPct(progress: { total: number; completed: number; failed: number }): number {
  if (progress.total === 0) return 0;
  return Math.round(((progress.completed + progress.failed) / progress.total) * 100);
}

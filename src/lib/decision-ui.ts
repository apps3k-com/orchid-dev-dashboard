import type { DecisionKind } from "@/server/decisions/queue";

/** Presentation for a Decision-Queue kind: a short group label and the Badge variant to tint it. */
export interface DecisionKindStyle {
  label: string;
  badge: "default" | "secondary" | "destructive" | "outline";
}

const STYLES: Record<DecisionKind, DecisionKindStyle> = {
  failing_checks: { label: "Failing checks", badge: "destructive" },
  agent_waiting: { label: "Agent waiting", badge: "default" },
  unresolved_threads: { label: "Review threads", badge: "secondary" },
  ready_to_merge: { label: "Ready to merge", badge: "default" },
  audit_finding: { label: "Audit finding", badge: "secondary" },
  batch_failed: { label: "Batch failed", badge: "destructive" },
};

/** Style for a decision kind (pure — unit-tested). Falls back to a neutral outline badge. */
export function decisionKindStyle(kind: DecisionKind): DecisionKindStyle {
  return STYLES[kind] ?? { label: kind, badge: "outline" };
}

/** True when the URL is an in-app route (leading slash) vs an external GitHub link. */
export function isInternalUrl(url: string | null): boolean {
  return typeof url === "string" && url.startsWith("/");
}

/** A compact relative-age label (e.g. "3d", "5h", "just now") from two instants (pure). */
export function relativeAge(from: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

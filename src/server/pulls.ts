/** Status buckets for the cross-repo PR board, most-attention-needed first. */
export type PrBucket =
  | "changes_requested"
  | "checks_failing"
  | "ready"
  | "approved"
  | "draft"
  | "other";

/** Display order of the buckets on the board. */
export const BUCKET_ORDER: PrBucket[] = [
  "changes_requested",
  "checks_failing",
  "ready",
  "approved",
  "draft",
  "other",
];

/** Human labels for each bucket. */
export const BUCKET_LABEL: Record<PrBucket, string> = {
  changes_requested: "Changes requested",
  checks_failing: "Checks failing",
  ready: "Ready for review",
  approved: "Approved",
  draft: "Draft",
  other: "Other",
};

/** Classify a PR into a single status bucket (pure — unit-tested). Draft wins; then
 *  requested-changes, then failing checks, then approved, then awaiting review. */
export function prBucket(
  pr: { isDraft: boolean; reviewDecision: string | null; checksState: string | null },
): PrBucket {
  if (pr.isDraft) return "draft";
  if (pr.reviewDecision === "CHANGES_REQUESTED") return "changes_requested";
  if (pr.checksState === "FAILURE" || pr.checksState === "ERROR") return "checks_failing";
  if (pr.reviewDecision === "APPROVED") return "approved";
  if (pr.reviewDecision === "REVIEW_REQUIRED" || pr.reviewDecision === null) return "ready";
  return "other";
}

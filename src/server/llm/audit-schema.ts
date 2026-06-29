// The structured-output contract for an audit run: the JSON schema sent to the provider plus the
// matching TS types and an anti-hallucination validator. Kept provider-agnostic.

import { isAuditPath } from "@/server/llm/audit-scope";

export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const CATEGORIES = [
  "redundancy",
  "misconfiguration",
  "security",
  "optimization",
  "inconsistency",
  "missing",
  "deprecated",
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Category = (typeof CATEGORIES)[number];

/** One finding as emitted by the model. */
export type AuditFindingResult = {
  title: string;
  severity: Severity;
  category: Category;
  file: string;
  lineHint: number | null;
  evidence: string | null;
  rationale: string;
  recommendation: string;
  autoFixable: boolean;
  proposedPatch: string | null;
};

/** The full structured audit result. */
export type AuditResult = {
  summary: { overallAssessment: string; score: number };
  findings: AuditFindingResult[];
};

/** JSON Schema handed to the provider's structured-output mode so the response is schema-valid.
 *
 *  IMPORTANT: Anthropic structured outputs REJECT numeric/length/array constraints (`minimum`,
 *  `maximum`, `maxLength`, `maxItems`, …) with a 400 — and we call the Messages API over raw `fetch`
 *  (no SDK to strip them client-side), so those bounds must NOT appear as schema keywords here. They
 *  live in `description` text as soft model guidance instead; hard limits are enforced in code
 *  (e.g. {@link clampScore} for the 0–100 score). Do not re-add `maxLength`/`minimum`/`maximum`/
 *  `maxItems` — that silently breaks every audit run. */
export const AUDIT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["overallAssessment", "score"],
      properties: {
        overallAssessment: {
          type: "string",
          description: "Concise overall assessment of the repo's agent/hook config health (aim for under ~1200 characters).",
        },
        score: {
          type: "integer",
          description: "Overall config health, 0 (worst) to 100 (best).",
        },
      },
    },
    findings: {
      type: "array",
      description: "High-signal findings; prefer quality over quantity (at most ~50).",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "severity",
          "category",
          "file",
          "lineHint",
          "evidence",
          "rationale",
          "recommendation",
          "autoFixable",
          "proposedPatch",
        ],
        properties: {
          title: { type: "string", description: "Short finding title (aim for under ~160 characters)." },
          severity: { type: "string", enum: [...SEVERITIES] },
          category: { type: "string", enum: [...CATEGORIES] },
          file: { type: "string", description: "Path of the cited file, within the audit surface." },
          lineHint: { type: ["integer", "null"], description: "1-based line in the cited file, or null." },
          evidence: {
            type: ["string", "null"],
            description: "Verbatim snippet copied from the cited file (aim for under ~600 characters), or null.",
          },
          rationale: {
            type: "string",
            description: "Why this is a problem (aim for under ~800 characters).",
          },
          recommendation: {
            type: "string",
            description: "How to fix it (aim for under ~800 characters).",
          },
          autoFixable: {
            type: "boolean",
            description: "True only when proposedPatch holds the complete replacement content for this single file.",
          },
          proposedPatch: {
            type: ["string", "null"],
            description: "Complete replacement content of the cited file when autoFixable, otherwise null.",
          },
        },
      },
    },
  },
} as const;

const SEVERITY_SET = new Set<string>(SEVERITIES);
const CATEGORY_SET = new Set<string>(CATEGORIES);

/** Drop hallucinated/invalid findings and keep known severity + category. A finding about an
 *  EXISTING file must cite a file that was actually audited (anti-hallucination). A `missing`-category
 *  finding recommends an absent file, so it can't be in the audited set — but it must still name a
 *  path WITHIN the audit surface (`isAuditPath`), so the model can't invent arbitrary out-of-scope
 *  "missing" paths. */
export function validateFindings(
  findings: AuditFindingResult[],
  auditedFiles: Set<string>,
): AuditFindingResult[] {
  return findings.filter(
    (f) =>
      ((f.category === "missing" && isAuditPath(f.file)) || auditedFiles.has(f.file)) &&
      SEVERITY_SET.has(f.severity) &&
      CATEGORY_SET.has(f.category),
  );
}

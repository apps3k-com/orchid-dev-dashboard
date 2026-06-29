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

/** JSON Schema handed to the provider's structured-output mode so the response is schema-valid. */
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
        overallAssessment: { type: "string", maxLength: 1200 },
        score: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    findings: {
      type: "array",
      maxItems: 50,
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
          title: { type: "string", maxLength: 160 },
          severity: { type: "string", enum: [...SEVERITIES] },
          category: { type: "string", enum: [...CATEGORIES] },
          file: { type: "string" },
          lineHint: { type: ["integer", "null"] },
          evidence: { type: ["string", "null"], maxLength: 600 },
          rationale: { type: "string", maxLength: 800 },
          recommendation: { type: "string", maxLength: 800 },
          autoFixable: { type: "boolean" },
          proposedPatch: { type: ["string", "null"] },
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

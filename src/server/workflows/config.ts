import type { Repo } from "@prisma/client";
import { repoClient } from "@/server/github/writeback";

export const WORKFLOW_CONFIG_PATH = "configs/plane-github/config.json";

type WorkflowConfig = { bindings: Array<Record<string, unknown>>; todoDispatch?: unknown; [key: string]: unknown };

/** Read the canonical workflow config from the exact default-branch snapshot used for a proposed PR. */
export async function readWorkflowConfig(repo: Repo): Promise<WorkflowConfig> {
  const { octokit, owner, name, base } = await repoClient(repo);
  const response = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo: name,
    path: WORKFLOW_CONFIG_PATH,
    ref: base,
  });
  if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
    throw new Error("Workflow configuration is not a readable file on the default branch.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(response.data.content, "base64").toString("utf8"));
  } catch {
    throw new Error("Workflow configuration is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { bindings?: unknown }).bindings)) {
    throw new Error("Workflow configuration has no bindings array.");
  }
  return parsed as WorkflowConfig;
}

/** Merge exactly one evaluated binding by repository identity, preserving all other configuration. */
export function mergeWorkflowBinding(
  current: WorkflowConfig,
  proposedBinding: Record<string, unknown>,
): WorkflowConfig {
  const repository = proposedBinding.repository;
  if (typeof repository !== "string" || !repository) throw new Error("Bridge proposed a binding without a repository identity.");
  const matches = current.bindings.filter((binding) => binding.repository === repository).length;
  if (matches > 1) throw new Error("Workflow configuration has duplicate bindings for the proposed repository.");
  const nextBindings = matches === 1
    ? current.bindings.map((binding) => binding.repository === repository ? proposedBinding : binding)
    : [...current.bindings, proposedBinding];
  return { ...current, bindings: nextBindings };
}

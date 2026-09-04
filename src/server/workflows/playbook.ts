import type { WorkflowProfile } from "./types";

/** Describe the selected profile without credentials so operators can keep the generated playbook. */
export function localPlaybook(profile: WorkflowProfile): string {
  return `# Workflow control profile: ${profile.repository}\n\n` +
    `- Plane: ${profile.workspaceSlug}/${profile.projectIdentifier}\n` +
    `- Default branch: ${profile.defaultBranch}\n` +
    `- Mode: ${profile.mode}\n` +
    `- Preview: Coolify application \`${profile.preview.applicationId}\`\n` +
    `- Staging workflow: ${profile.staging.workflow}\n\n` +
    "Use the bridge simulation before proposing this profile. The bridge remains the only evaluator and Plane writer.\n";
}

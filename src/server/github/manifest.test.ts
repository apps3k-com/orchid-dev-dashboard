import { describe, expect, it } from "vitest";
import { buildAppManifest } from "./manifest";

describe("buildAppManifest", () => {
  const m = buildAppManifest("https://orchid.example.com", "Orchid (example)");

  it("points the redirect_url at /setup/callback", () => {
    expect(m.redirect_url).toBe("https://orchid.example.com/setup/callback");
  });

  it("is a private app", () => {
    expect(m.public).toBe(false);
  });

  it("requests the core permissions", () => {
    expect(m.default_permissions.contents).toBe("write");
    expect(m.default_permissions.issues).toBe("write");
    expect(m.default_permissions.pull_requests).toBe("write");
    expect(m.default_permissions.members).toBe("read");
    expect(m.default_permissions.organization_projects).toBe("write");
    expect(m.default_permissions.variables).toBe("write");
    expect(m.default_permissions.organization_secrets).toBe("write");
  });
});

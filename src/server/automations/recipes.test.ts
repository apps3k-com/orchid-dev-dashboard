import { describe, expect, it } from "vitest";
import { getRecipe, RECIPES } from "./recipes";

describe("recipe catalog", () => {
  it("exposes recipes by id", () => {
    expect(RECIPES.length).toBeGreaterThan(0);
    expect(getRecipe("auto-add-to-project")?.name).toBe("Auto-add issues to a Project");
    expect(getRecipe("nope")).toBeUndefined();
  });
});

describe("auto-add-to-project recipe", () => {
  const recipe = getRecipe("auto-add-to-project")!;
  const file = recipe.render()[0];

  it("renders a workflow under .github/workflows", () => {
    expect(file.path).toBe(".github/workflows/orchid-auto-add-to-project.yml");
  });

  it("carries the managed header and a self-disable guard", () => {
    expect(file.content).toContain("# >>> orchid: recipe=auto-add-to-project version=1 <<<");
    expect(file.content).toContain("if: ${{ vars.ORCHID_PROJECT_URL != '' }}");
  });

  it("pins both actions to a commit SHA", () => {
    expect(file.content).toMatch(/actions\/create-github-app-token@[0-9a-f]{40}/);
    expect(file.content).toMatch(/actions\/add-to-project@[0-9a-f]{40}/);
  });

  it("triggers on issues.opened", () => {
    expect(file.content).toContain("issues:");
    expect(file.content).toContain("types: [opened]");
  });
});

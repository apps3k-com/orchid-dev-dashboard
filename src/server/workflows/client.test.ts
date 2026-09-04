import { afterEach, describe, expect, it, vi } from "vitest";
import { listWorkflowProfiles, reconcileWorkflow } from "./client";

describe("workflow bridge client", () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.WORKFLOW_BRIDGE_URL;
  const originalRead = process.env.BRIDGE_READ_TOKEN;
  const originalOperator = process.env.BRIDGE_OPERATOR_TOKEN;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.WORKFLOW_BRIDGE_URL; else process.env.WORKFLOW_BRIDGE_URL = originalUrl;
    if (originalRead === undefined) delete process.env.BRIDGE_READ_TOKEN; else process.env.BRIDGE_READ_TOKEN = originalRead;
    if (originalOperator === undefined) delete process.env.BRIDGE_OPERATOR_TOKEN; else process.env.BRIDGE_OPERATOR_TOKEN = originalOperator;
  });

  it("uses the fixed bridge origin and read bearer token", async () => {
    process.env.WORKFLOW_BRIDGE_URL = "http://bridge.internal:8789/";
    process.env.BRIDGE_READ_TOKEN = "read-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 1, profiles: [] }), { status: 200 }));
    global.fetch = fetchMock;
    await expect(listWorkflowProfiles()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://bridge.internal:8789/api/v1/profiles"), expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer read-token" }) }));
  });

  it("uses the operator token for explicit reconciliation, including observe mode", async () => {
    process.env.WORKFLOW_BRIDGE_URL = "http://bridge.internal:8789";
    process.env.BRIDGE_READ_TOKEN = "read-token";
    process.env.BRIDGE_OPERATOR_TOKEN = "operator-token";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ schemaVersion: 1, mode: "full", deliveries: [] }), { status: 200 }));
    global.fetch = fetchMock;
    await reconcileWorkflow({ repository: "apps3k-com/Venuemaster3000", apply: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer operator-token");
  });

  it("rejects a queued response where synchronous delivery evidence is required", async () => {
    process.env.WORKFLOW_BRIDGE_URL = "http://bridge.internal:8789";
    process.env.BRIDGE_OPERATOR_TOKEN = "operator-token";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      status: "queued",
      mode: "full",
    }), { status: 202 }));

    await expect(reconcileWorkflow({ repository: "apps3k-com/Venuemaster3000" }))
      .rejects.toThrow("unsupported reconciliation response");
  });
});

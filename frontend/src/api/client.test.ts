// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

describe("assistant API client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("gets building identity by UUID and preserves 404 status", async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.getBuilding(id)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledWith(`/buildings/${id}`);
    expect(new ApiError(404)).toBeInstanceOf(Error);
  });

  it('gets zone identity through the existing UUID endpoint', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.getZone(id)).toEqual({ id });
    expect(fetchMock).toHaveBeenCalledWith(`/zones/${id}`);
  });

  it('gets device UUID identity and bounded zone history', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id }), { status: 200 })).mockResolvedValueOnce(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await api.getDevice(id)).toEqual({ id });
    expect(await api.zoneTelemetry(id, 10)).toEqual([]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/devices/${id}`);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/zones/${id}/telemetry?limit=10`);
  });

  it("posts a typed message to the AI endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: "No active alerts.",
            model: "gemini-test",
            grounded: true,
            sources: ["get_active_alerts"],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.chat("Which alerts are active?");
    expect(fetchMock).toHaveBeenCalledWith("/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Which alerts are active?" }),
    });
    expect(result.grounded).toBe(true);
  });

  it("uses the API detail when chat fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "AI unavailable" }), {
            status: 503,
          }),
        ),
    );
    await expect(api.chat("What is happening?")).rejects.toThrow(
      "AI unavailable",
    );
  });
});

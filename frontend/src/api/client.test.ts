// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";

describe("assistant API client", () => {
  afterEach(() => vi.restoreAllMocks());

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

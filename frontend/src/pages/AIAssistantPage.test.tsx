// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIAssistantPage } from "./AIAssistantPage";

describe("AIAssistantPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows four starters and renders the user and grounded assistant messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: "Open Office CO2 is 700 ppm at 10:00 UTC.",
          model: "gemini-test",
          grounded: true,
          sources: ["get_current_building_state"],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AIAssistantPage />);

    expect(
      screen.getAllByRole("button", { name: /building|zone|alerts|power/i }),
    ).toHaveLength(4);
    fireEvent.click(
      screen.getByRole("button", { name: "Which zone has the highest CO₂?" }),
    );

    expect(
      screen.getByText("Which zone has the highest CO₂?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking BuildingOps data",
    );
    await waitFor(() =>
      expect(
        screen.getByText("Open Office CO2 is 700 ppm at 10:00 UTC."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Grounded in BuildingOps data"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/ai/chat",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("submits typed text and renders API failures safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: "AI assistant is temporarily unavailable.",
          }),
          {
            status: 503,
          },
        ),
      ),
    );
    render(<AIAssistantPage />);
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "Why is energy high?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Why is energy high?")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "AI assistant is temporarily unavailable.",
      ),
    );
  });

  it("prevents duplicate submissions while a request is pending", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AIAssistantPage />);

    const starter = screen.getByRole("button", {
      name: "Summarize the building right now.",
    });
    fireEvent.click(starter);
    expect(
      screen.getByRole("button", { name: "Investigating…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Question")).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRequest?.(
      new Response(
        JSON.stringify({
          answer: "Summary",
          model: "gemini-test",
          grounded: true,
          sources: [],
        }),
        { status: 200 },
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Summary")).toBeInTheDocument(),
    );
  });

  it("renders an operational-data fallback returned as a safe chat response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: "BuildingOps operational data is temporarily unavailable.",
            model: "gemini-3.8-flash",
            grounded: false,
            sources: [],
          }),
          { status: 200 },
        ),
      ),
    );
    render(<AIAssistantPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Which zones have active alerts?" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("BuildingOps operational data is temporarily unavailable."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Assistant status")).toBeInTheDocument();
  });
});

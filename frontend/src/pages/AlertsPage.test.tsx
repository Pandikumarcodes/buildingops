// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "./AlertsPage";

const active = {
  id: "1",
  zone_id: "zone-1",
  zone_name: "Open Office",
  floor_name: "Floor 1",
  alert_type: "HIGH_CO2",
  severity: "WARNING",
  status: "ACTIVE",
  message: "High CO₂ detected in Open Office.",
  trigger_value: 1450,
  triggered_at: "2026-09-30T12:00:00Z",
  resolved_at: null,
};
const resolved = {
  ...active,
  id: "2",
  alert_type: "HIGH_ZONE_POWER",
  status: "RESOLVED",
  message: "High power demand detected in Open Office.",
  trigger_value: 10.5,
  resolved_at: "2026-09-30T12:05:00Z",
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AlertsPage />
    </QueryClientProvider>,
  );
}

describe("AlertsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders active and resolved alerts with human-readable labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(input.includes("RESOLVED") ? [resolved] : [active]),
            { status: 200 },
          ),
        ),
      ),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("High CO₂")).toBeInTheDocument(),
    );
    expect(screen.getByText("High Zone Power")).toBeInTheDocument();
    expect(screen.getByText("1450 ppm")).toBeInTheDocument();
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
  });

  it("shows empty active and resolved states", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))),
    );
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText("No active telemetry alerts."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("No recently resolved alerts."),
    ).toBeInTheDocument();
  });

  it("shows an API error without a broken page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 500 }))),
    );
    renderPage();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("renders the Lens wordmark and the connect CTA when no vaults exist", () => {
    render(<App />);
    expect(screen.getByRole("link", { name: /parachute lens/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect a vault/i })).toBeInTheDocument();
    expect(screen.getByText(/no vault connected/i)).toBeInTheDocument();
  });
});

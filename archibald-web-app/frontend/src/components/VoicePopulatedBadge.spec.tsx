import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoicePopulatedBadge } from "./VoicePopulatedBadge";

describe("VoicePopulatedBadge", () => {
  test("displays high confidence with correct styling", () => {
    const highConfidence = 0.85;
    const { container } = render(
      <VoicePopulatedBadge confidence={highConfidence} />,
    );

    const badge = container.querySelector(".voice-badge");
    expect(badge).toBeTruthy();
    expect(badge).toHaveClass("voice-badge-high");
    expect(badge?.textContent).toContain("85%");
  });

  test("displays medium confidence with correct styling", () => {
    const mediumConfidence = 0.6;
    const { container } = render(
      <VoicePopulatedBadge confidence={mediumConfidence} />,
    );

    const badge = container.querySelector(".voice-badge");
    expect(badge).toBeTruthy();
    expect(badge).toHaveClass("voice-badge-medium");
    expect(badge?.textContent).toContain("60%");
  });

  test("displays default confidence when not provided", () => {
    const { container } = render(<VoicePopulatedBadge />);

    const badge = container.querySelector(".voice-badge");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("80%");
  });

  test("displays tooltip with confidence percentage", () => {
    const confidence = 0.9;
    const { container } = render(
      <VoicePopulatedBadge confidence={confidence} />,
    );

    const badge = container.querySelector(".voice-badge");
    expect(badge?.getAttribute("title")).toBe(
      "Populated by voice input (90% confidence)",
    );
  });

  test("rounds confidence percentage correctly", () => {
    const confidence = 0.777;
    const { container } = render(
      <VoicePopulatedBadge confidence={confidence} />,
    );

    const badge = container.querySelector(".voice-badge");
    expect(badge?.textContent).toContain("78%");
  });
});

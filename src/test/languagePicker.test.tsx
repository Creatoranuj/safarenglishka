import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import LanguagePicker from "@/components/Layout/LanguagePicker";

vi.mock("@/lib/native/haptics", () => ({
  selectionHaptic: vi.fn(),
  tapHaptic: vi.fn(),
}));

const renderPicker = (onPicked?: () => void) =>
  render(
    <LanguageProvider>
      <LanguagePicker onPicked={onPicked} />
    </LanguageProvider>,
  );

describe("LanguagePicker", () => {
  it("switches the UI to Hindi and closes the caller surface", async () => {
    const onPicked = vi.fn();
    renderPicker(onPicked);

    fireEvent.click(screen.getByRole("button", { name: /Language/i }));
    fireEvent.click(screen.getByRole("radio", { name: /हिंदी/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /भाषा/ })).toBeInTheDocument();
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(document.documentElement.lang).toBe("hi");
  });

  it("layers the sheet above the sidebar (z-index guard)", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Language|भाषा/ }));
    const sheet = document.querySelector('[role="dialog"]');
    expect(sheet?.className).toContain("z-[120]");
  });
});

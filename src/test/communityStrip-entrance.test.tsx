import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import CommunityStrip from "../components/Landing/CommunityStrip";

vi.mock("@/lib/native/haptics", () => ({
  tapHaptic: vi.fn(),
  selectionHaptic: vi.fn(),
}));

/**
 * The strip is lazy-loaded on the landing page. Before this guard both CTAs
 * snapped into place the instant the chunk resolved, which read as a hard jump
 * on Android. The entrance must stay: reserved row height + staggered fade-up.
 */
describe("CommunityStrip entrance", () => {
  it("renders both CTAs with a staggered fade-up entrance", () => {
    const { getByText } = render(<CommunityStrip />);

    const telegram = getByText("Join Telegram").closest("a")!;
    const youtube = getByText("Subscribe on YouTube").closest("a")!;

    expect(telegram.className).toContain("animate-fade-in-up");
    expect(youtube.className).toContain("animate-fade-in-up");

    // YouTube is the second button — it must lag behind Telegram.
    expect(youtube.className).toContain("animation-delay:90ms");
    expect(telegram.className).not.toContain("animation-delay");
  });

  it("reserves the button row height so the fade never shifts layout", () => {
    const { getByText } = render(<CommunityStrip />);
    const row = getByText("Join Telegram").closest("a")!.parentElement!;
    expect(row.className).toMatch(/min-h-\[6\.5rem\]/);
  });

  it("keeps press feedback on both CTAs", () => {
    const { getByText } = render(<CommunityStrip />);
    for (const label of ["Join Telegram", "Subscribe on YouTube"]) {
      const el = getByText(label).closest("a")!;
      expect(el.className).toContain("active:scale-[0.97]");
      expect(el.className).toContain("h-11");
    }
  });
});

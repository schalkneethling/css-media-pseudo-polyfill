import { describe, expect, it, vi } from "vite-plus/test";
import { detectUnsupported } from "../../src/polyfill.js";

describe("detectUnsupported", () => {
  it("returns a Set", () => {
    const result = detectUnsupported();
    expect(result).toBeInstanceOf(Set);
  });

  it("returns all 7 pseudo-classes in jsdom (no native support)", () => {
    const expected = new Set([
      "playing",
      "paused",
      "seeking",
      "buffering",
      "stalled",
      "muted",
      "volume-locked",
    ]);
    const result = detectUnsupported();
    expect(result.size).toBe(expected.size);
    expect(expected.difference(result).size).toBe(0);
  });

  it("returns all pseudo-classes when CSS is undefined", () => {
    const originalCSS = globalThis.CSS;
    // @ts-expect-error -- testing missing CSS global
    globalThis.CSS = undefined;
    try {
      const result = detectUnsupported();
      expect(result.size).toBe(7);
    } finally {
      globalThis.CSS = originalCSS;
    }
  });

  it("handles CSS.supports throwing", () => {
    const originalCSS = globalThis.CSS;
    globalThis.CSS = {
      supports: () => {
        throw new Error("not supported");
      },
    } as unknown as typeof CSS;
    try {
      const result = detectUnsupported();
      expect(result.size).toBe(7);
    } finally {
      globalThis.CSS = originalCSS;
    }
  });

  it("excludes natively supported pseudo-classes", () => {
    const originalCSS = globalThis.CSS;
    globalThis.CSS = {
      supports: vi.fn((query: string) => {
        return query === "selector(:playing)" || query === "selector(:paused)";
      }),
    } as unknown as typeof CSS;
    try {
      const expected = new Set(["seeking", "buffering", "stalled", "muted", "volume-locked"]);
      const result = detectUnsupported();
      expect(result.size).toBe(expected.size);
      expect(expected.difference(result).size).toBe(0);
    } finally {
      globalThis.CSS = originalCSS;
    }
  });
});

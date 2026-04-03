import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
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

describe("polyfill()", () => {
  const originalCSS = globalThis.CSS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.CSS = originalCSS;
  });

  it("returns early without calling subsystems when all pseudo-classes are supported", async () => {
    // Make CSS.supports return true for everything
    globalThis.CSS = {
      supports: vi.fn(() => true),
    } as unknown as typeof CSS;

    const rewriteModule = await import("../../src/rewrite.js");
    const rewriteLinkModule = await import("../../src/rewrite-link.js");
    const observeModule = await import("../../src/observe.js");
    const observeStylesModule = await import("../../src/observe-stylesheets.js");

    const spyRewriteStyle = vi.spyOn(rewriteModule, "rewriteStyleElements");
    const spyRewriteLink = vi.spyOn(rewriteLinkModule, "rewriteLinkStylesheets");
    const spyObserveMedia = vi.spyOn(observeModule, "observeMediaElements");
    const spyObserveStyles = vi.spyOn(observeStylesModule, "observeStylesheets");

    const { polyfill } = await import("../../src/polyfill.js");
    polyfill();

    expect(spyRewriteStyle).not.toHaveBeenCalled();
    expect(spyRewriteLink).not.toHaveBeenCalled();
    expect(spyObserveMedia).not.toHaveBeenCalled();
    expect(spyObserveStyles).not.toHaveBeenCalled();
  });

  it("calls all four subsystems when pseudo-classes are unsupported", async () => {
    // Make CSS.supports return false for everything
    globalThis.CSS = {
      supports: vi.fn(() => false),
    } as unknown as typeof CSS;

    const rewriteModule = await import("../../src/rewrite.js");
    const rewriteLinkModule = await import("../../src/rewrite-link.js");
    const observeModule = await import("../../src/observe.js");
    const observeStylesModule = await import("../../src/observe-stylesheets.js");

    const spyRewriteStyle = vi
      .spyOn(rewriteModule, "rewriteStyleElements")
      .mockImplementation(() => {});
    const spyRewriteLink = vi
      .spyOn(rewriteLinkModule, "rewriteLinkStylesheets")
      .mockImplementation(() => {});
    const spyObserveMedia = vi
      .spyOn(observeModule, "observeMediaElements")
      .mockImplementation(() => {});
    const spyObserveStyles = vi
      .spyOn(observeStylesModule, "observeStylesheets")
      .mockImplementation(() => {});

    const { polyfill } = await import("../../src/polyfill.js");
    polyfill();

    expect(spyRewriteStyle).toHaveBeenCalledOnce();
    expect(spyRewriteLink).toHaveBeenCalledOnce();
    expect(spyObserveMedia).toHaveBeenCalledOnce();
    expect(spyObserveStyles).toHaveBeenCalledOnce();
  });
});

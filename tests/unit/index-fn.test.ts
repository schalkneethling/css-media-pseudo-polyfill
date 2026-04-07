import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";

const originalCSS = globalThis.CSS;
const originalDocument = globalThis.document;

describe("index-fn.ts — ./fn entry point", () => {
  beforeEach(() => {
    vi.resetModules();

    // Minimal CSS.supports mock — return true for everything so polyfill()
    // exits early without requiring a full DOM environment.
    globalThis.CSS = {
      supports: vi.fn(() => true),
    } as unknown as typeof CSS;

    globalThis.document = {
      readyState: "interactive",
      querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(),
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.CSS = originalCSS;
    globalThis.document = originalDocument;
  });

  it("exports polyfill as a named export", async () => {
    const module = await import("../../src/index-fn.js");
    expect(module.polyfill).toBeDefined();
    expect(typeof module.polyfill).toBe("function");
  });

  it("exports the same polyfill function as polyfill.ts", async () => {
    const fnModule = await import("../../src/index-fn.js");
    const polyfillModule = await import("../../src/polyfill.js");
    expect(fnModule.polyfill).toBe(polyfillModule.polyfill);
  });

  it("polyfill() is callable and does not throw", async () => {
    const { polyfill } = await import("../../src/index-fn.js");
    expect(() => polyfill()).not.toThrow();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";

const originalDocument = globalThis.document;

describe("index.ts — entry point timing", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it("defers polyfill() via DOMContentLoaded when readyState is 'loading'", async () => {
    let capturedListener: EventListener | null = null;
    const mockAddEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === "DOMContentLoaded") {
        capturedListener = listener;
      }
    });

    globalThis.document = {
      readyState: "loading",
      addEventListener: mockAddEventListener,
    } as unknown as Document;

    await import("../../src/index.js");

    expect(mockAddEventListener).toHaveBeenCalledWith("DOMContentLoaded", expect.any(Function));
    expect(capturedListener).not.toBeNull();
  });

  it("calls polyfill() immediately when readyState is 'interactive'", async () => {
    // When the document is already past loading, polyfill() should run
    // synchronously. We mock CSS.supports to return true for everything
    // so polyfill() returns early without needing full DOM mocks.
    const originalCSS = globalThis.CSS;
    globalThis.CSS = {
      supports: vi.fn(() => true),
    } as unknown as typeof CSS;

    const mockAddEventListener = vi.fn();
    globalThis.document = {
      readyState: "interactive",
      addEventListener: mockAddEventListener,
    } as unknown as Document;

    try {
      await import("../../src/index.js");

      // Should NOT register a DOMContentLoaded listener
      expect(mockAddEventListener).not.toHaveBeenCalled();
    } finally {
      globalThis.CSS = originalCSS;
    }
  });

  it("calls polyfill() immediately when readyState is 'complete'", async () => {
    const originalCSS = globalThis.CSS;
    globalThis.CSS = {
      supports: vi.fn(() => true),
    } as unknown as typeof CSS;

    const mockAddEventListener = vi.fn();
    globalThis.document = {
      readyState: "complete",
      addEventListener: mockAddEventListener,
    } as unknown as Document;

    try {
      await import("../../src/index.js");

      expect(mockAddEventListener).not.toHaveBeenCalled();
    } finally {
      globalThis.CSS = originalCSS;
    }
  });
});

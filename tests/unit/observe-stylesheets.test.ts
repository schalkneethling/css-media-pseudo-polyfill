import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { parse, walk, generate } from "css-tree";

const ALL_UNSUPPORTED = new Set([
  "playing",
  "paused",
  "seeking",
  "buffering",
  "stalled",
  "muted",
  "volume-locked",
]);

// --- MutationObserver mock ---

let mutationCallback: MutationCallback;
let mockObserverInstance: {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
const originalMutationObserver = globalThis.MutationObserver;

/**
 * Extract rule selectors from parsed CSS in document order.
 */
function extractRuleSelectors(css: string): string[] {
  const ast = parse(css);
  const selectors: string[] = [];

  walk(ast, {
    visit: "Rule",
    enter(node) {
      selectors.push(generate(node.prelude));
    },
  });

  return selectors;
}

// --- Base element mock ---

interface MockElement {
  tagName: string;
  nodeType: number;
  attributes: Map<string, string>;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  getAttribute: (name: string) => string | null;
  querySelectorAll: (selector: string) => MockElement[];
}

function createMockElement(tagName: string): MockElement {
  const attributes = new Map<string, string>();
  return {
    tagName,
    nodeType: 1,
    attributes,
    hasAttribute(name: string) {
      return attributes.has(name);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
    },
    querySelectorAll(_selector: string) {
      return [];
    },
  };
}

// --- Style element mock ---

interface MockStyleElement extends MockElement {
  textContent: string | null;
}

function createMockStyleElement(cssText: string): MockStyleElement {
  return {
    ...createMockElement("STYLE"),
    textContent: cssText,
  };
}

// --- Link element mock ---

interface MockLinkElement extends MockElement {
  href: string;
  disabled: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  after: ReturnType<typeof vi.fn>;
}

function createMockLinkElement(href = "http://localhost:3000/styles.css"): MockLinkElement {
  const element = createMockElement("LINK");
  element.attributes.set("rel", "stylesheet");
  return {
    ...element,
    href,
    disabled: false,
    addEventListener: vi.fn(),
    after: vi.fn(),
  };
}

// --- Container mock ---

function createMockContainer(children: Array<MockStyleElement | MockLinkElement>): {
  tagName: string;
  nodeType: number;
  querySelectorAll: (selector: string) => Array<MockStyleElement | MockLinkElement>;
} {
  return {
    tagName: "DIV",
    nodeType: 1,
    querySelectorAll(selector: string) {
      if (selector.startsWith("style")) {
        return children.filter((child) => child.tagName === "STYLE");
      }
      if (selector.startsWith("link")) {
        return children.filter((child) => child.tagName === "LINK");
      }
      return [];
    },
  };
}

// --- Document and global mocks ---

const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function mockFetchResponse(cssText: string): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ text: () => Promise.resolve(cssText) }),
  ) as unknown as typeof fetch;
}

function setupGlobals(): void {
  globalThis.MutationObserver = vi.fn(function MockMutationObserver(callback: MutationCallback) {
    mutationCallback = callback;
    mockObserverInstance = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };
    return mockObserverInstance;
  }) as unknown as typeof MutationObserver;

  globalThis.document = {
    documentElement: { tagName: "HTML" },
    createElement: vi.fn(() => ({
      textContent: null,
      setAttribute: vi.fn(),
    })),
  } as unknown as Document;

  globalThis.window = {
    location: { origin: "http://localhost:3000" },
  } as unknown as Window & typeof globalThis;

  // Default fetch mock — returns empty CSS
  mockFetchResponse("");
}

function restoreGlobals(): void {
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock records don't satisfy full MutationRecord interface
function triggerMutation(records: Record<string, any>[]): void {
  mutationCallback(
    records as MutationRecord[],
    mockObserverInstance as unknown as MutationObserver,
  );
}

describe("observeStylesheets", () => {
  beforeEach(async () => {
    vi.resetModules();
    setupGlobals();

    const module = await import("../../src/observe-stylesheets.js");
    module.observeStylesheets(ALL_UNSUPPORTED);
  });

  afterEach(() => {
    restoreGlobals();
  });

  describe("dynamically added elements", () => {
    it("rewrites a new <style> element added to the DOM", () => {
      const style = createMockStyleElement("video:playing { color: green }");

      triggerMutation([
        {
          type: "childList",
          addedNodes: [style],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      const selectors = extractRuleSelectors(style.textContent!);
      expect(selectors).toContain("video.media-pseudo-polyfill-playing");
      expect(style.hasAttribute("data-polyfill-rewritten")).toBe(true);
    });

    it("skips a <style> that already has data-polyfill-rewritten", () => {
      const style = createMockStyleElement("video:playing { color: green }");
      style.setAttribute("data-polyfill-rewritten", "");
      const originalContent = style.textContent;

      triggerMutation([
        {
          type: "childList",
          addedNodes: [style],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      // Content should be untouched — the observer skipped it
      expect(style.textContent).toBe(originalContent);
    });

    it("discovers <style> nested inside a container element", () => {
      const style = createMockStyleElement("video:paused { opacity: 0.5 }");
      const container = createMockContainer([style]);

      triggerMutation([
        {
          type: "childList",
          addedNodes: [container],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      const selectors = extractRuleSelectors(style.textContent!);
      expect(selectors).toContain("video.media-pseudo-polyfill-paused");
      expect(style.hasAttribute("data-polyfill-rewritten")).toBe(true);
    });

    it("processes a new <link> via fetch", async () => {
      mockFetchResponse("video:playing { color: green }");
      const link = createMockLinkElement();

      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      // processLinkSheet is async — wait for it to complete
      await vi.waitFor(() => {
        expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);
      });
    });

    it("discovers <link> nested inside a container element", async () => {
      mockFetchResponse("video:playing { color: green }");
      const link = createMockLinkElement();
      const container = createMockContainer([link]);

      triggerMutation([
        {
          type: "childList",
          addedNodes: [container],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      await vi.waitFor(() => {
        expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);
      });
    });

    it("ignores non-stylesheet link elements", () => {
      const link = createMockLinkElement();
      link.attributes.delete("rel");
      link.attributes.set("rel", "icon");

      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      expect(link.addEventListener).not.toHaveBeenCalled();
      expect(link.hasAttribute("data-polyfill-rewritten")).toBe(false);
    });

    it("ignores non-element added nodes", () => {
      const textNode = { nodeType: 3, tagName: undefined };

      // Should not throw
      triggerMutation([
        {
          type: "childList",
          addedNodes: [textNode],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);
    });
  });

  describe("style content mutations", () => {
    it("re-processes a <style> when author replaces textContent (childList on style)", () => {
      // Simulate initial processing: style added to DOM
      const style = createMockStyleElement("video:playing { color: green }");
      triggerMutation([
        {
          type: "childList",
          addedNodes: [style],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);
      expect(style.hasAttribute("data-polyfill-rewritten")).toBe(true);

      // Consume the rewritingInProgress guard (polyfill's own write fires this)
      triggerMutation([{ type: "childList", addedNodes: [], removedNodes: [], target: style }]);

      // Author replaces content with new CSS
      style.textContent = "video:muted { opacity: 0.5 }";

      // childList mutation on the <style> element itself (text child replaced)
      triggerMutation([{ type: "childList", addedNodes: [], removedNodes: [], target: style }]);

      const selectors = extractRuleSelectors(style.textContent!);
      expect(selectors).toContain("video.media-pseudo-polyfill-muted");
      expect(style.hasAttribute("data-polyfill-rewritten")).toBe(true);
    });

    it("skips polyfill's own textContent mutation via rewritingInProgress guard", () => {
      const style = createMockStyleElement("video:playing { color: green }");

      // First mutation: style is added → polyfill rewrites textContent
      // That rewrite itself fires a childList mutation on the <style> target.
      // The callback should process the addedNodes mutation (the initial add)
      // and skip the content-change mutation (polyfill's own write).
      triggerMutation([
        {
          type: "childList",
          addedNodes: [style],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      const rewrittenContent = style.textContent;

      // Now simulate the mutation that the polyfill's own textContent write would cause
      triggerMutation([{ type: "childList", addedNodes: [], removedNodes: [], target: style }]);

      // Content should not have been modified again
      expect(style.textContent).toBe(rewrittenContent);
    });

    it("re-processes when author modifies text node directly (characterData)", () => {
      const style = createMockStyleElement("video:playing { color: green }");
      triggerMutation([
        {
          type: "childList",
          addedNodes: [style],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);
      expect(style.hasAttribute("data-polyfill-rewritten")).toBe(true);

      // Clear the rewritingInProgress guard from the initial write
      triggerMutation([{ type: "childList", addedNodes: [], removedNodes: [], target: style }]);

      // Author modifies the text node directly
      style.textContent = "video:buffering { color: yellow }";

      // characterData mutation — target is the text node, parentElement is <style>
      const textNode = { parentElement: style };
      triggerMutation([
        { type: "characterData", target: textNode, addedNodes: [], removedNodes: [] },
      ]);

      const selectors = extractRuleSelectors(style.textContent!);
      expect(selectors).toContain("video.media-pseudo-polyfill-buffering");
    });

    it("safely handles characterData on a text node without a parent element", () => {
      const orphanTextNode = { parentElement: null };

      // Should not throw
      triggerMutation([
        { type: "characterData", target: orphanTextNode, addedNodes: [], removedNodes: [] },
      ]);
    });

    it("ignores characterData on a text node whose parent is not a <style>", () => {
      const divElement = createMockElement("DIV");
      const textNode = { parentElement: divElement };

      // Should not throw or trigger any processing
      triggerMutation([
        { type: "characterData", target: textNode, addedNodes: [], removedNodes: [] },
      ]);

      expect(divElement.hasAttribute("data-polyfill-rewritten")).toBe(false);
    });
  });

  describe("link href attribute changes", () => {
    it("removes marker and re-processes when href changes", async () => {
      mockFetchResponse("video:playing { color: green }");
      const link = createMockLinkElement();

      // Simulate initial processing
      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      await vi.waitFor(() => {
        expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);
      });

      // href changes — re-fetches and re-processes
      triggerMutation([
        {
          type: "attributes",
          target: link,
          attributeName: "href",
          addedNodes: [],
          removedNodes: [],
        },
      ]);

      // Marker is removed synchronously, then re-added after async processing
      expect(link.hasAttribute("data-polyfill-rewritten")).toBe(false);

      await vi.waitFor(() => {
        expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);
      });
    });

    it("ignores attribute changes on non-stylesheet links", () => {
      const link = createMockLinkElement();
      link.attributes.delete("rel");
      link.attributes.set("rel", "icon");

      triggerMutation([
        {
          type: "attributes",
          target: link,
          attributeName: "href",
          addedNodes: [],
          removedNodes: [],
        },
      ]);

      expect(link.addEventListener).not.toHaveBeenCalled();
    });

    it("ignores attribute changes on non-link elements with href", () => {
      const anchor = createMockElement("A");
      anchor.setAttribute("href", "http://localhost:3000/page");

      // Should not throw or trigger any processing
      triggerMutation([
        {
          type: "attributes",
          target: anchor,
          attributeName: "href",
          addedNodes: [],
          removedNodes: [],
        },
      ]);

      expect(anchor.hasAttribute("data-polyfill-rewritten")).toBe(false);
    });
  });

  describe("observer setup", () => {
    it("creates a MutationObserver", () => {
      expect(globalThis.MutationObserver).toHaveBeenCalledOnce();
    });

    it("observes document.documentElement with correct config", () => {
      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href"],
      });
    });
  });
});

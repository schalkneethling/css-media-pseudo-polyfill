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
  sheet: { cssRules: unknown[] } | null;
  addEventListener: ReturnType<typeof vi.fn>;
}

function createMockLinkElement(sheet: { cssRules: unknown[] } | null): MockLinkElement {
  const element = createMockElement("LINK");
  element.attributes.set("rel", "stylesheet");
  return {
    ...element,
    sheet,
    addEventListener: vi.fn(),
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

// --- Document mock ---

const originalDocument = globalThis.document;

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
  } as unknown as Document;
}

function restoreGlobals(): void {
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.document = originalDocument;
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

    it("processes a new <link> with a loaded sheet immediately", () => {
      const link = createMockLinkElement({ cssRules: [] });

      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      // processLinkSheet marks the element after processing
      expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);
    });

    it("defers processing a new <link> with null sheet via load listener", () => {
      const link = createMockLinkElement(null);

      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);

      expect(link.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), {
        once: true,
      });
    });

    it("ignores non-stylesheet link elements", () => {
      const link = createMockLinkElement(null);
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
  });

  describe("link href attribute changes", () => {
    it("removes marker and defers to load event when href changes", () => {
      const link = createMockLinkElement({ cssRules: [] });
      // Simulate initial processing
      triggerMutation([
        {
          type: "childList",
          addedNodes: [link],
          removedNodes: [],
          target: document.documentElement,
        },
      ]);
      expect(link.hasAttribute("data-polyfill-rewritten")).toBe(true);

      // href changes — always defer to load, never process stale sheet
      triggerMutation([
        {
          type: "attributes",
          target: link,
          attributeName: "href",
          addedNodes: [],
          removedNodes: [],
        },
      ]);

      expect(link.hasAttribute("data-polyfill-rewritten")).toBe(false);
      expect(link.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), {
        once: true,
      });
    });

    it("ignores attribute changes on non-stylesheet links", () => {
      const link = createMockLinkElement(null);
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

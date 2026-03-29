import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";

const ALL_UNSUPPORTED = new Set([
  "playing",
  "paused",
  "seeking",
  "buffering",
  "stalled",
  "muted",
  "volume-locked",
]);

// --- CSSOM mock helpers ---

interface MockCSSStyleRule {
  type: 1;
  selectorText: string;
  style: { cssText: string };
  cssText: string;
}

interface MockCSSGroupingRule {
  type: number;
  cssRules: Array<MockCSSStyleRule | MockCSSGroupingRule>;
  insertRule: ReturnType<typeof vi.fn>;
  conditionText?: string;
}

interface MockCSSStyleSheet {
  cssRules: Array<MockCSSStyleRule | MockCSSGroupingRule>;
  insertRule: ReturnType<typeof vi.fn>;
}

function createMockStyleRule(selectorText: string, declarations: string): MockCSSStyleRule {
  return {
    type: 1,
    selectorText,
    style: { cssText: declarations },
    cssText: `${selectorText} { ${declarations} }`,
  };
}

/**
 * Creates a mock insertRule implementation that parses "selector { declarations }"
 * text and splices a new MockCSSStyleRule into the target rules array.
 */
function mockInsertRule(
  rulesArray: Array<MockCSSStyleRule | MockCSSGroupingRule>,
): ReturnType<typeof vi.fn> {
  return vi.fn((ruleText: string, index: number) => {
    const selectorMatch = ruleText.match(/^([^{]+)\{([^}]*)\}$/);
    if (selectorMatch) {
      const newRule = createMockStyleRule(selectorMatch[1].trim(), selectorMatch[2].trim());
      rulesArray.splice(index, 0, newRule);
    }
    return index;
  });
}

function createMockGroupingRule(
  type: number,
  rules: Array<MockCSSStyleRule | MockCSSGroupingRule>,
): MockCSSGroupingRule {
  const cssRules = [...rules];
  return {
    type,
    cssRules,
    insertRule: mockInsertRule(cssRules),
  };
}

function createMockStyleSheet(
  rules: Array<MockCSSStyleRule | MockCSSGroupingRule>,
): MockCSSStyleSheet {
  const cssRules = [...rules];
  return {
    cssRules,
    insertRule: mockInsertRule(cssRules),
  };
}

function asStyleRule(rule: MockCSSStyleRule | MockCSSGroupingRule): MockCSSStyleRule {
  return rule as MockCSSStyleRule;
}

// --- Link element mock helpers ---

interface MockLinkElement {
  sheet: MockCSSStyleSheet | null;
  attributes: Map<string, string>;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  addEventListener: ReturnType<typeof vi.fn>;
}

function createMockLinkElement(sheet: MockCSSStyleSheet | null): MockLinkElement {
  const attributes = new Map<string, string>();
  return {
    sheet,
    attributes,
    hasAttribute(name: string) {
      return attributes.has(name);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    addEventListener: vi.fn(),
  };
}

// --- Document mock ---

let mockLinkElements: MockLinkElement[] = [];
let mockQuerySelectorAll: ReturnType<typeof vi.fn>;
const originalDocument = globalThis.document;

// --- Tests ---

describe("rewriteSelector", () => {
  async function importModule() {
    const module = await import("../../src/rewrite-link.js");
    return module.rewriteSelector as (
      selectorText: string,
      unsupported: Set<string>,
    ) => string | null;
  }

  it("returns null for selector with no target pseudo-classes", async () => {
    const rewriteSelector = await importModule();
    expect(rewriteSelector("video:hover", /* unsupported */ ALL_UNSUPPORTED)).toBeNull();
  });

  it("rewrites :playing to class selector", async () => {
    const rewriteSelector = await importModule();
    const result = rewriteSelector("video:playing", /* unsupported */ ALL_UNSUPPORTED);
    expect(result).toBe("video.media-pseudo-polyfill-playing");
  });

  it("rewrites compound selector with multiple pseudo-classes", async () => {
    const rewriteSelector = await importModule();
    const result = rewriteSelector(
      "video.player:playing:not(:paused)",
      /* unsupported */ ALL_UNSUPPORTED,
    );
    expect(result).toBe(
      "video.player.media-pseudo-polyfill-playing:not(.media-pseudo-polyfill-paused)",
    );
  });

  it("rewrites pseudo-classes inside :is()", async () => {
    const rewriteSelector = await importModule();
    const result = rewriteSelector(
      "video:is(:playing, :paused)",
      /* unsupported */ ALL_UNSUPPORTED,
    );
    expect(result).toBe("video:is(.media-pseudo-polyfill-playing,.media-pseudo-polyfill-paused)");
  });

  it("handles :volume-locked in selector list — prunes it", async () => {
    const rewriteSelector = await importModule();
    const result = rewriteSelector(
      "video:playing, video:volume-locked",
      /* unsupported */ ALL_UNSUPPORTED,
    );
    expect(result).toBe("video.media-pseudo-polyfill-playing");
  });

  it("handles :volume-locked inside :not() — rewrites to class", async () => {
    const rewriteSelector = await importModule();
    const result = rewriteSelector("video:not(:volume-locked)", /* unsupported */ ALL_UNSUPPORTED);
    expect(result).toBe("video:not(.media-pseudo-polyfill-volume-locked)");
  });

  it("returns null for lone :volume-locked", async () => {
    const rewriteSelector = await importModule();
    expect(rewriteSelector("video:volume-locked", /* unsupported */ ALL_UNSUPPORTED)).toBeNull();
  });

  it("only rewrites unsupported pseudo-classes", async () => {
    const rewriteSelector = await importModule();
    const partialUnsupported = new Set(["buffering"]);
    // :playing is natively supported, :buffering is not
    const result = rewriteSelector(
      "video:playing, video:buffering",
      /* unsupported */ partialUnsupported,
    );
    // Only :buffering is rewritten; :playing stays as-is
    expect(result).toContain("media-pseudo-polyfill-buffering");
    expect(result).not.toContain("media-pseudo-polyfill-playing");
    expect(result).toContain("video:playing");
  });
});

describe("rewriteCssomRules", () => {
  async function importModule() {
    const module = await import("../../src/rewrite-link.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock types don't match full CSSOM interfaces
    return module.rewriteCssomRules as (...args: any[]) => boolean;
  }

  // Supporting evidence for the isGroupingRule duck-typing check:
  //   "cssRules" in rule && "insertRule" in rule
  //
  // Per the CSSOM spec (https://drafts.csswg.org/cssom/#the-cssgroupingrule-interface):
  //   - CSSGroupingRule exposes `cssRules` and `insertRule`
  //   - CSSStyleRule does NOT have either property
  //
  // This test verifies the structural distinction our mocks mirror.
  it("style rules lack cssRules/insertRule while grouping rules have both", () => {
    const styleRule = createMockStyleRule("video:playing", "color: green");
    const groupingRule = createMockGroupingRule(4, []);

    expect("cssRules" in styleRule).toBe(false);
    expect("insertRule" in styleRule).toBe(false);

    expect("cssRules" in groupingRule).toBe(true);
    expect("insertRule" in groupingRule).toBe(true);
  });

  it("returns false when no rules match", async () => {
    const rewriteCssomRules = await importModule();
    const sheet = createMockStyleSheet([createMockStyleRule("video:hover", "color: green")]);

    const result = rewriteCssomRules(sheet, /* unsupported */ ALL_UNSUPPORTED);
    expect(result).toBe(false);
    expect(sheet.cssRules.length).toBe(1);
  });

  it("inserts class-based sibling after matching rule", async () => {
    const rewriteCssomRules = await importModule();
    const sheet = createMockStyleSheet([createMockStyleRule("video:playing", "color: green")]);

    const result = rewriteCssomRules(sheet, /* unsupported */ ALL_UNSUPPORTED);
    expect(result).toBe(true);
    expect(sheet.cssRules.length).toBe(2);
    expect(asStyleRule(sheet.cssRules[0]).selectorText).toBe("video:playing");
    expect(asStyleRule(sheet.cssRules[1]).selectorText).toBe("video.media-pseudo-polyfill-playing");
  });

  it("tracks indices correctly with multiple insertions", async () => {
    const rewriteCssomRules = await importModule();
    const sheet = createMockStyleSheet([
      createMockStyleRule("video:playing", "color: green"),
      createMockStyleRule("div", "color: red"),
      createMockStyleRule("audio:paused", "color: blue"),
    ]);

    rewriteCssomRules(sheet, /* unsupported */ ALL_UNSUPPORTED);

    expect(sheet.cssRules.length).toBe(5);
    expect(asStyleRule(sheet.cssRules[0]).selectorText).toBe("video:playing");
    expect(asStyleRule(sheet.cssRules[1]).selectorText).toBe("video.media-pseudo-polyfill-playing");
    expect(asStyleRule(sheet.cssRules[2]).selectorText).toBe("div");
    expect(asStyleRule(sheet.cssRules[3]).selectorText).toBe("audio:paused");
    expect(asStyleRule(sheet.cssRules[4]).selectorText).toBe("audio.media-pseudo-polyfill-paused");
  });

  it("recurses into CSSMediaRule", async () => {
    const rewriteCssomRules = await importModule();
    const mediaRule = createMockGroupingRule(4, [
      createMockStyleRule("video:playing", "color: green"),
    ]);
    const sheet = createMockStyleSheet([mediaRule]);

    expect(mediaRule.cssRules.length).toBe(1);

    rewriteCssomRules(sheet, /* unsupported */ ALL_UNSUPPORTED);

    // The sheet itself should not have new rules; the media rule should
    expect(sheet.cssRules.length).toBe(1);
    expect(mediaRule.cssRules.length).toBe(2);
    expect(asStyleRule(mediaRule.cssRules[0]).selectorText).toBe("video:playing");
    expect(asStyleRule(mediaRule.cssRules[1]).selectorText).toBe(
      "video.media-pseudo-polyfill-playing",
    );
  });

  it("recurses into CSSSupportsRule", async () => {
    const rewriteCssomRules = await importModule();
    // CSSSupportsRule type = 12
    const supportsRule = createMockGroupingRule(12, [
      createMockStyleRule("video:muted", "opacity: 0.5"),
    ]);
    const sheet = createMockStyleSheet([supportsRule]);

    expect(supportsRule.cssRules.length).toBe(1);

    rewriteCssomRules(sheet, /* unsupported */ ALL_UNSUPPORTED);

    expect(supportsRule.cssRules.length).toBe(2);
    expect(asStyleRule(supportsRule.cssRules[1]).selectorText).toBe(
      "video.media-pseudo-polyfill-muted",
    );
  });
});

describe("rewriteLinkStylesheets", () => {
  beforeEach(() => {
    mockLinkElements = [];
    mockQuerySelectorAll = vi.fn((_selector: string) => {
      return mockLinkElements;
    });

    globalThis.document = {
      querySelectorAll: mockQuerySelectorAll,
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  async function importModule() {
    const module = await import("../../src/rewrite-link.js");
    return module.rewriteLinkStylesheets as (unsupported: Set<string>) => void;
  }

  it("queries for link[rel=stylesheet] elements", async () => {
    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    expect(mockQuerySelectorAll).toHaveBeenCalledWith(
      'link[rel="stylesheet"]:not([data-polyfill-rewritten])',
    );
  });

  it("processes link with loaded sheet and marks it", async () => {
    const sheet = createMockStyleSheet([createMockStyleRule("video:playing", "color: green")]);
    const link = createMockLinkElement(sheet);
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    expect(sheet.cssRules.length).toBe(2);
    expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
  });

  it("defers processing for link with null sheet via load listener", async () => {
    const link = createMockLinkElement(/* sheet */ null);
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    expect(link.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), {
      once: true,
    });
  });

  it("processes sheet when load event fires", async () => {
    const sheet = createMockStyleSheet([createMockStyleRule("video:paused", "opacity: 0.5")]);
    const link = createMockLinkElement(/* sheet */ null);
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    // Sheet not processed yet
    expect(sheet.cssRules.length).toBe(1);

    // Simulate sheet loading
    link.sheet = sheet;
    const loadHandler = link.addEventListener.mock.calls[0][1] as EventListener;
    loadHandler(new Event("load"));

    expect(sheet.cssRules.length).toBe(2);
    expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
  });

  it("catches SecurityError for cross-origin sheets and skips", async () => {
    const sheet = {
      get cssRules(): never {
        throw new DOMException("Blocked", "SecurityError");
      },
      insertRule: vi.fn(),
    };
    const link = createMockLinkElement(sheet as unknown as MockCSSStyleSheet);
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    // Should not throw
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    expect(link.attributes.has("data-polyfill-rewritten")).toBe(false);
  });

  it("does not double-process when load fires after already processed", async () => {
    const sheet = createMockStyleSheet([createMockStyleRule("video:playing", "color: green")]);
    const link = createMockLinkElement(sheet);
    // Pre-mark as already rewritten
    link.setAttribute("data-polyfill-rewritten", "");
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(/* unsupported */ ALL_UNSUPPORTED);

    // Should not have been processed (still 1 rule)
    expect(sheet.cssRules.length).toBe(1);
  });
});

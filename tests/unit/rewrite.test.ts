import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { parse, walk, generate } from "css-tree";
import type { CssNode, Atrule } from "css-tree";
import { rewriteCss } from "../../src/rewrite.js";

const ALL_UNSUPPORTED = new Set([
  "playing",
  "paused",
  "seeking",
  "buffering",
  "stalled",
  "muted",
  "volume-locked",
]);

function normalize(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

/**
 * Extract rule selectors from parsed CSS in document order.
 * Returns an array of selector strings (e.g., ["video:playing", "video.cls"]).
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

interface RuleInfo {
  selector: string;
  parentAtRule: string | null;
}

/**
 * Extract rules with their parent at-rule context.
 * For top-level rules, parentAtRule is null.
 * For rules inside @media/@layer, parentAtRule is the at-rule prelude
 * (e.g., "(min-width:768px)" or "base").
 */
function extractRulesWithContext(css: string): RuleInfo[] {
  const ast = parse(css);
  const rules: RuleInfo[] = [];
  const atRuleStack: (string | null)[] = [null];

  walk(ast, {
    enter(node: CssNode) {
      if (node.type === "Atrule") {
        const atrule = node as Atrule;
        const name = atrule.name;
        const prelude = atrule.prelude ? generate(atrule.prelude) : "";
        atRuleStack.push(`@${name} ${prelude}`.trim());
      }
      if (node.type === "Rule") {
        rules.push({
          selector: generate((node as CssNode & { prelude: CssNode }).prelude),
          parentAtRule: atRuleStack[atRuleStack.length - 1],
        });
      }
    },
    leave(node: CssNode) {
      if (node.type === "Atrule") {
        atRuleStack.pop();
      }
    },
  });

  return rules;
}

describe("rewriteCss", () => {
  describe("basic selector rewriting", () => {
    it("injects class-based sibling after original rule: video:playing", () => {
      const result = rewriteCss(
        "video:playing { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      // Original rule preserved
      expect(normalized).toContain("video:playing{color:green}");
      // Class-based sibling injected after it
      expect(normalized).toContain("video.media-pseudo-polyfill-playing{color:green}");
    });

    it("rewrites compound selector: video.player:playing:not(:paused)", () => {
      const result = rewriteCss(
        "video.player:playing:not(:paused) { color: green }",
        ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      // Original preserved
      expect(normalized).toContain("video.player:playing:not(:paused){color:green}");
      // Sibling with class selectors
      expect(normalized).toContain(
        "video.player.media-pseudo-polyfill-playing:not(.media-pseudo-polyfill-paused){color:green}",
      );
    });

    it("rewrites nested :is()", () => {
      const result = rewriteCss(
        "video:is(:playing, :paused) { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("video:is(:playing,:paused){color:green}");
      expect(normalized).toContain(
        "video:is(.media-pseudo-polyfill-playing,.media-pseudo-polyfill-paused){color:green}",
      );
    });

    it("rewrites :where()", () => {
      const result = rewriteCss(
        ":where(video:playing) { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain(":where(video:playing){color:green}");
      expect(normalized).toContain(":where(video.media-pseudo-polyfill-playing){color:green}");
    });

    it("rewrites :has()", () => {
      const result = rewriteCss(
        "div:has(video:playing) { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("div:has(video:playing){color:green}");
      expect(normalized).toContain("div:has(video.media-pseudo-polyfill-playing){color:green}");
    });

    it("preserves pseudo-elements: video:playing::cue", () => {
      const result = rewriteCss(
        "video:playing::cue { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("video:playing::cue{color:green}");
      expect(normalized).toContain("video.media-pseudo-polyfill-playing::cue{color:green}");
    });
  });

  describe("immediate-sibling injection", () => {
    it("places class-based rule immediately after original", () => {
      const result = rewriteCss(
        "video:playing { color: green }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      expect(selectors).toEqual(["video:playing", "video.media-pseudo-polyfill-playing"]);
    });

    it("maintains relative order: original A, sibling A, unrelated B, original C, sibling C", () => {
      const input = `
        video:playing { color: green }
        video { color: red }
        audio:paused { color: blue }
      `;
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      expect(selectors).toEqual([
        "video:playing",
        "video.media-pseudo-polyfill-playing",
        "video",
        "audio:paused",
        "audio.media-pseudo-polyfill-paused",
      ]);
    });
  });

  describe("@media and @layer nesting", () => {
    it("both original and sibling remain inside @media", () => {
      const input = "@media (min-width: 768px) { video:playing { color: green } }";
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const rules = extractRulesWithContext(result!);
      expect(rules).toEqual([
        { selector: "video:playing", parentAtRule: "@media (min-width:768px)" },
        {
          selector: "video.media-pseudo-polyfill-playing",
          parentAtRule: "@media (min-width:768px)",
        },
      ]);
    });

    it("both original and sibling remain inside @layer", () => {
      const input = "@layer base { video:playing { color: green } }";
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const rules = extractRulesWithContext(result!);
      expect(rules).toEqual([
        { selector: "video:playing", parentAtRule: "@layer base" },
        { selector: "video.media-pseudo-polyfill-playing", parentAtRule: "@layer base" },
      ]);
    });
  });

  describe(":volume-locked handling", () => {
    it("removes sibling for rule with lone :volume-locked selector", () => {
      const result = rewriteCss(
        "video:volume-locked { color: red }",
        /* unsupported */ ALL_UNSUPPORTED,
      );
      // Only the original remains; no sibling injected and no class-based rule
      // Since no useful rewrite occurred, returns null
      expect(result).toBeNull();
    });

    it("prunes :volume-locked branch from selector list in sibling, preserving siblings", () => {
      const input = "video:playing, video:volume-locked { color: green }";
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      // Original preserved with both branches, sibling has :volume-locked pruned
      expect(selectors).toEqual([
        "video:playing,video:volume-locked",
        "video.media-pseudo-polyfill-playing",
      ]);
    });

    it("removes :volume-locked argument from :is() in sibling", () => {
      const input = "video:is(:playing, :volume-locked) { color: green }";
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      // Original preserved, sibling has :volume-locked removed from :is()
      expect(selectors[0]).toBe("video:is(:playing,:volume-locked)");
      expect(selectors[1]).toContain("media-pseudo-polyfill-playing");
      expect(selectors[1]).not.toContain("volume-locked");
    });

    it("rewrites :volume-locked inside :not() to class selector in sibling", () => {
      const input = "video:not(:volume-locked) { color: green }";
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      // Original preserved
      expect(normalized).toContain("video:not(:volume-locked){color:green}");
      // Sibling with class selector
      expect(normalized).toContain("video:not(.media-pseudo-polyfill-volume-locked){color:green}");
    });
  });

  describe("no rewrites", () => {
    it("returns null when no target pseudo-classes are present", () => {
      const result = rewriteCss("video:hover { color: green }", /* unsupported */ ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });

    it("returns null for empty CSS", () => {
      const result = rewriteCss("", /* unsupported */ ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });

    it("returns null when generated output is whitespace-only", () => {
      // CSS with only :volume-locked as a lone selector — the sibling
      // injection prunes it entirely, leaving an empty output after generate().
      const result = rewriteCss("video:volume-locked { color: red }", ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });
  });

  describe("multiple rules", () => {
    it("injects siblings only for matching rules, includes all in output", () => {
      const input = `
        video:playing { color: green }
        div { color: red }
        audio:muted { color: blue }
      `;
      const result = rewriteCss(input, /* unsupported */ ALL_UNSUPPORTED);
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      expect(selectors).toEqual([
        "video:playing",
        "video.media-pseudo-polyfill-playing",
        "div",
        "audio:muted",
        "audio.media-pseudo-polyfill-muted",
      ]);
    });
  });

  describe("partial support", () => {
    it("only rewrites unsupported pseudo-classes", () => {
      const partialUnsupported = new Set(["buffering", "stalled"]);
      const input = "video:playing { color: green } video:buffering { color: yellow }";
      const result = rewriteCss(input, /* unsupported */ partialUnsupported);
      expect(result).not.toBeNull();

      const selectors = extractRuleSelectors(result!);
      // :playing is natively supported — no sibling. :buffering gets a sibling.
      expect(selectors).toEqual([
        "video:playing",
        "video:buffering",
        "video.media-pseudo-polyfill-buffering",
      ]);
    });
  });
});

// --- rewriteSingleStyleElement and rewriteStyleElements ---

interface MockStyleElement {
  textContent: string | null;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  attributes: Map<string, string>;
}

function createMockStyleElement(cssText: string): MockStyleElement {
  const attributes = new Map<string, string>();
  return {
    textContent: cssText,
    hasAttribute(name: string) {
      return attributes.has(name);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    attributes,
  };
}

describe("rewriteSingleStyleElement", () => {
  let rewriteSingleStyleElement: typeof import("../../src/rewrite.js").rewriteSingleStyleElement;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../../src/rewrite.js");
    rewriteSingleStyleElement = module.rewriteSingleStyleElement;
  });

  it("rewrites textContent and sets data-polyfill-rewritten", () => {
    const style = createMockStyleElement("video:playing { color: green }");

    rewriteSingleStyleElement(style as unknown as HTMLStyleElement, ALL_UNSUPPORTED);

    expect(style.textContent).toContain("media-pseudo-polyfill-playing");
    expect(style.attributes.has("data-polyfill-rewritten")).toBe(true);
  });

  it("does NOT set data-polyfill-rewritten when CSS has no pseudo-classes", () => {
    const style = createMockStyleElement("div { color: red }");

    rewriteSingleStyleElement(style as unknown as HTMLStyleElement, ALL_UNSUPPORTED);

    expect(style.textContent).toBe("div { color: red }");
    expect(style.attributes.has("data-polyfill-rewritten")).toBe(false);
  });

  it("skips style elements with null textContent", () => {
    const style = createMockStyleElement(null as unknown as string);
    style.textContent = null;

    rewriteSingleStyleElement(style as unknown as HTMLStyleElement, ALL_UNSUPPORTED);

    expect(style.textContent).toBeNull();
    expect(style.attributes.has("data-polyfill-rewritten")).toBe(false);
  });
});

describe("rewriteStyleElements", () => {
  const originalDocument = globalThis.document;

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it("queries for unprocessed style elements and rewrites them", async () => {
    vi.resetModules();

    const style1 = createMockStyleElement("video:playing { color: green }");
    const style2 = createMockStyleElement("div { color: red }");

    globalThis.document = {
      querySelectorAll: vi.fn(() => [style1, style2]),
    } as unknown as Document;

    const module = await import("../../src/rewrite.js");
    module.rewriteStyleElements(ALL_UNSUPPORTED);

    expect(style1.textContent).toContain("media-pseudo-polyfill-playing");
    expect(style1.attributes.has("data-polyfill-rewritten")).toBe(true);

    // style2 has no pseudo-classes — left unchanged
    expect(style2.textContent).toBe("div { color: red }");
    expect(style2.attributes.has("data-polyfill-rewritten")).toBe(false);
  });
});

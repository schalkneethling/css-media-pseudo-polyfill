// Derived from WPT: css/selectors/media/media-playback-state.html
// WPT incompatibility: CSS.supports() skip guard; querySelector/matches with native pseudo-classes.
// Translated to verify polyfill equivalents: CSS rewriting + class toggling.

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { rewriteCss } from "../../src/rewrite.js";
import {
  ALL_UNSUPPORTED,
  createMockMediaElement,
  extractRuleSelectors,
  fireEvent,
  hasPolyfillClass,
  setupIntegrationEnvironment,
  teardownIntegrationEnvironment,
} from "./helpers.js";
import type { MockMediaElement } from "./helpers.js";

let observeMediaElements: typeof import("../../src/observe.js").observeMediaElements;

describe("media-playback-state (WPT)", () => {
  let video: MockMediaElement;

  beforeEach(async () => {
    vi.resetModules();
    video = createMockMediaElement();
    setupIntegrationEnvironment([video]);

    const module = await import("../../src/observe.js");
    observeMediaElements = module.observeMediaElements;
  });

  afterEach(() => {
    teardownIntegrationEnvironment();
  });

  it.skip(
    "syntax support — tests native CSS parser, covered by polyfill.test.ts detectUnsupported()",
  );

  it(":playing — after play, video has playing class and rewritten selector matches", () => {
    // Verify CSS rewriting produces the class-based sibling selector
    const rewritten = rewriteCss(
      "video:playing { color: green } video:paused { color: red }",
      ALL_UNSUPPORTED,
    );
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("video.media-pseudo-polyfill-playing");
    expect(selectors).toContain("video.media-pseudo-polyfill-paused");

    // Observe the element and verify initial paused state
    observeMediaElements(ALL_UNSUPPORTED);
    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);

    // Simulate play: paused becomes false, fire play event
    video.paused = false;
    fireEvent(video, "play");

    expect(hasPolyfillClass(video, "playing")).toBe(true);
    expect(hasPolyfillClass(video, "paused")).toBe(false);
  });

  it(":paused — before playing, video has paused class and not playing", () => {
    const rewritten = rewriteCss(
      "video:paused { opacity: 0.5 } video:playing { opacity: 1 }",
      ALL_UNSUPPORTED,
    );
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("video.media-pseudo-polyfill-paused");
    expect(selectors).toContain("video.media-pseudo-polyfill-playing");

    // Element starts paused (default)
    observeMediaElements(ALL_UNSUPPORTED);
    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);
  });

  it(":seeking — after currentTime change, video has seeking class; cleared after seeked", () => {
    const rewritten = rewriteCss("video:seeking { outline: 2px solid blue }", ALL_UNSUPPORTED);
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("video.media-pseudo-polyfill-seeking");

    observeMediaElements(ALL_UNSUPPORTED);
    expect(hasPolyfillClass(video, "seeking")).toBe(false);

    // Simulate seeking
    video.seeking = true;
    fireEvent(video, "seeking");
    expect(hasPolyfillClass(video, "seeking")).toBe(true);

    // Simulate seeked
    video.seeking = false;
    fireEvent(video, "seeked");
    expect(hasPolyfillClass(video, "seeking")).toBe(false);
  });

  it("non-media elements do not get polyfill classes toggled", () => {
    // The rewrite module will transform any selector textually
    const rewritten = rewriteCss("div:playing { color: green }", ALL_UNSUPPORTED);
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("div.media-pseudo-polyfill-playing");

    // But observeMediaElements only attaches listeners to <video> and <audio>.
    // A <div> element is never discovered or bound. Set up environment with
    // no elements — a real querySelectorAll("audio, video") would not match a div.
    setupIntegrationEnvironment([]);
    observeMediaElements(ALL_UNSUPPORTED);

    const div = createMockMediaElement({ tagName: "DIV" });

    // The div has no listeners attached, so no classes are ever toggled
    expect(hasPolyfillClass(div, "playing")).toBe(false);
    expect(hasPolyfillClass(div, "paused")).toBe(false);
    expect(hasPolyfillClass(div, "seeking")).toBe(false);
  });
});

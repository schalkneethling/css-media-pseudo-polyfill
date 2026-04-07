// Derived from WPT: css/selectors/media/media-loading-state.sub.html
// WPT incompatibility: CSS.supports() skip guard; querySelector with native pseudo-class;
// .sub.html server-side template (stall-resume.py) replaced with mock element state.
// Translated to verify polyfill equivalents: CSS rewriting + class toggling.

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { rewriteCss } from "../../src/rewrite.js";
import {
  ALL_UNSUPPORTED,
  NETWORK_LOADING,
  HAVE_CURRENT_DATA,
  createMockMediaElement,
  extractRuleSelectors,
  fireEvent,
  hasPolyfillClass,
  setupIntegrationEnvironment,
  teardownIntegrationEnvironment,
} from "./helpers.js";
import type { MockMediaElement } from "./helpers.js";

let observeMediaElements: typeof import("../../src/observe.js").observeMediaElements;

describe("media-loading-state (WPT)", () => {
  let video: MockMediaElement;

  beforeEach(async () => {
    vi.resetModules();
    // Set up a playing element that is loading with limited data — the conditions
    // for :buffering. WPT achieves this via a stall-resume.py server; we mock it directly.
    video = createMockMediaElement({
      paused: false,
      networkState: NETWORK_LOADING,
      readyState: HAVE_CURRENT_DATA,
    });
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

  it(":stalled — stalled event while playing and loading produces stalled class", () => {
    const rewritten = rewriteCss("video:stalled { outline: 2px solid red }", ALL_UNSUPPORTED);
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("video.media-pseudo-polyfill-stalled");

    observeMediaElements(ALL_UNSUPPORTED);

    // Initially: not paused + NETWORK_LOADING + low readyState → buffering, but NOT stalled
    // (stalled flag starts false)
    expect(hasPolyfillClass(video, "buffering")).toBe(true);
    expect(hasPolyfillClass(video, "stalled")).toBe(false);

    // Fire stalled event — sets the isCurrentlyStalled flag
    fireEvent(video, "stalled");
    expect(hasPolyfillClass(video, "stalled")).toBe(true);
    // stalled and buffering are mutually exclusive
    expect(hasPolyfillClass(video, "buffering")).toBe(false);
  });

  it(":buffering — playing with NETWORK_LOADING and low readyState produces buffering class", () => {
    const rewritten = rewriteCss("video:buffering { background: yellow }", ALL_UNSUPPORTED);
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("video.media-pseudo-polyfill-buffering");

    observeMediaElements(ALL_UNSUPPORTED);

    // Element is not paused + NETWORK_LOADING + readyState <= HAVE_CURRENT_DATA → buffering
    expect(hasPolyfillClass(video, "buffering")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);
  });
});

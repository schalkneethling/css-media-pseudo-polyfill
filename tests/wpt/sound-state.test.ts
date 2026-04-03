// Derived from WPT: css/selectors/media/sound-state.html
// WPT incompatibility: CSS.supports() skip guard; querySelector with native pseudo-class.
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

describe("sound-state (WPT)", () => {
  let audio: MockMediaElement;

  beforeEach(async () => {
    vi.resetModules();
    audio = createMockMediaElement({ muted: false, tagName: "AUDIO" });
    setupIntegrationEnvironment([audio]);

    const module = await import("../../src/observe.js");
    observeMediaElements = module.observeMediaElements;
  });

  afterEach(() => {
    teardownIntegrationEnvironment();
  });

  it.skip(
    "syntax support — tests native CSS parser, covered by polyfill.test.ts detectUnsupported()",
  );

  it(":muted — toggling audio.muted toggles the polyfill class", () => {
    // Verify CSS rewriting
    const rewritten = rewriteCss("audio:muted { opacity: 0.5 }", ALL_UNSUPPORTED);
    const selectors = extractRuleSelectors(rewritten!);
    expect(selectors).toContain("audio.media-pseudo-polyfill-muted");

    // Observe — initially unmuted
    observeMediaElements(ALL_UNSUPPORTED);
    expect(hasPolyfillClass(audio, "muted")).toBe(false);

    // Mute the audio
    audio.muted = true;
    fireEvent(audio, "volumechange");
    expect(hasPolyfillClass(audio, "muted")).toBe(true);

    // Unmute the audio
    audio.muted = false;
    fireEvent(audio, "volumechange");
    expect(hasPolyfillClass(audio, "muted")).toBe(false);
  });
});

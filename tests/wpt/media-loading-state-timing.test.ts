// Derived from WPT: css/selectors/media/media-loading-state-timing.sub.html
// WPT incompatibility: CSS.supports() skip guard; element.matches() with native pseudo-class;
// .sub.html server-side template (stall-resume.py) replaced with mock element state.
// Behavioral gap: WPT uses timeupdate to clear :stalled; the polyfill uses progress
// (both indicate data arrival; progress is the correct signal for "no longer stalled").
// Translated to verify polyfill equivalents: class toggling via event-driven state.

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import {
  ALL_UNSUPPORTED,
  NETWORK_LOADING,
  NETWORK_IDLE,
  HAVE_CURRENT_DATA,
  HAVE_ENOUGH_DATA,
  createMockMediaElement,
  fireEvent,
  hasPolyfillClass,
  setupIntegrationEnvironment,
  teardownIntegrationEnvironment,
} from "./helpers.js";
import type { MockMediaElement } from "./helpers.js";

let observeMediaElements: typeof import("../../src/observe.js").observeMediaElements;

describe("media-loading-state-timing (WPT)", () => {
  let video: MockMediaElement;

  beforeEach(async () => {
    vi.resetModules();
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

  it(":stalled timing — matches after waiting+stalled events, clears after progress", () => {
    observeMediaElements(ALL_UNSUPPORTED);

    // waiting event alone does not set stalled flag
    fireEvent(video, "waiting");
    expect(hasPolyfillClass(video, "buffering")).toBe(true);
    expect(hasPolyfillClass(video, "stalled")).toBe(false);

    // stalled event sets the isCurrentlyStalled flag
    fireEvent(video, "stalled");
    expect(hasPolyfillClass(video, "stalled")).toBe(true);

    // progress event clears the stalled flag
    // (WPT uses timeupdate here, but the polyfill listens to progress instead —
    // both indicate data arrival; progress fires when the browser fetches new data)
    fireEvent(video, "progress");
    expect(hasPolyfillClass(video, "stalled")).toBe(false);

    // buffering may still be active if networkState/readyState haven't changed
    expect(hasPolyfillClass(video, "buffering")).toBe(true);

    // Once enough data is available, buffering also clears
    video.readyState = HAVE_ENOUGH_DATA;
    video.networkState = NETWORK_IDLE;
    fireEvent(video, "canplaythrough");
    expect(hasPolyfillClass(video, "buffering")).toBe(false);
    expect(hasPolyfillClass(video, "stalled")).toBe(false);
  });
});

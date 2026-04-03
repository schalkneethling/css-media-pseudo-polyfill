// Derived from WPT: css/selectors/media/media-playback-state-timing.html
// WPT incompatibility: CSS.supports() skip guard; element.matches() with native pseudo-class.
// Translated to verify polyfill equivalents: synchronous class toggling on events.

import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import {
  ALL_UNSUPPORTED,
  createMockMediaElement,
  fireEvent,
  hasPolyfillClass,
  setupIntegrationEnvironment,
  teardownIntegrationEnvironment,
} from "./helpers.js";
import type { MockMediaElement } from "./helpers.js";

let observeMediaElements: typeof import("../../src/observe.js").observeMediaElements;

describe("media-playback-state-timing (WPT)", () => {
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

  it(":playing and :paused timing without media resource — synchronous transitions", () => {
    observeMediaElements(ALL_UNSUPPORTED);

    // Initial state: paused
    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);

    // Simulate play() — paused becomes false synchronously
    video.paused = false;
    fireEvent(video, "play");

    // Immediately (no await) verify playing class
    expect(hasPolyfillClass(video, "playing")).toBe(true);
    expect(hasPolyfillClass(video, "paused")).toBe(false);

    // Simulate load() — resets to paused
    video.paused = true;
    fireEvent(video, "pause");

    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);
  });

  it(":playing and :paused timing with a media resource — same after canplay", () => {
    observeMediaElements(ALL_UNSUPPORTED);

    // Fire canplay — element is still paused
    fireEvent(video, "canplay");
    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);

    // Simulate play()
    video.paused = false;
    fireEvent(video, "play");
    fireEvent(video, "playing");

    expect(hasPolyfillClass(video, "playing")).toBe(true);
    expect(hasPolyfillClass(video, "paused")).toBe(false);

    // Simulate load() — resets to paused
    video.paused = true;
    fireEvent(video, "emptied");

    expect(hasPolyfillClass(video, "paused")).toBe(true);
    expect(hasPolyfillClass(video, "playing")).toBe(false);
  });

  it(":seeking timing — immediate after currentTime set, cleared by load()", () => {
    // Start playing so seeking is meaningful
    video.paused = false;
    observeMediaElements(ALL_UNSUPPORTED);

    expect(hasPolyfillClass(video, "seeking")).toBe(false);

    // Simulate setting currentTime — seeking becomes true synchronously
    video.seeking = true;
    fireEvent(video, "seeking");

    expect(hasPolyfillClass(video, "seeking")).toBe(true);

    // Simulate seeked
    video.seeking = false;
    fireEvent(video, "seeked");

    expect(hasPolyfillClass(video, "seeking")).toBe(false);

    // Simulate load() — resets seeking and stalled flag
    video.paused = true;
    fireEvent(video, "emptied");

    expect(hasPolyfillClass(video, "seeking")).toBe(false);
    expect(hasPolyfillClass(video, "paused")).toBe(true);
  });
});

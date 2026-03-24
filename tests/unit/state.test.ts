import { describe, it, expect } from "vite-plus/test";
import { computeStates } from "../../src/state.js";

// networkState: is the browser actively fetching data over the network?
const NETWORK_EMPTY = 0;
const NETWORK_IDLE = 1;
const NETWORK_LOADING = 2;

// readyState: how much media data has been decoded and is ready for playback?
const HAVE_NOTHING = 0;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;
const HAVE_FUTURE_DATA = 3;
const HAVE_ENOUGH_DATA = 4;

function createMockElement(props: {
  paused: boolean;
  networkState: number;
  readyState: number;
  seeking: boolean;
  muted: boolean;
}): HTMLMediaElement {
  return {
    ...props,
    NETWORK_EMPTY,
    NETWORK_IDLE,
    NETWORK_LOADING,
    NETWORK_NO_SOURCE: 3,
    HAVE_NOTHING,
    HAVE_METADATA,
    HAVE_CURRENT_DATA,
    HAVE_FUTURE_DATA,
    HAVE_ENOUGH_DATA,
  } as unknown as HTMLMediaElement;
}

function expectStates(actual: Set<string>, expected: string[]): void {
  const expectedSet = new Set(expected);
  expect(actual.symmetricDifference(expectedSet).size).toBe(0);
}

describe("computeStates", () => {
  const baseCase = {
    paused: false,
    networkState: NETWORK_IDLE,
    readyState: HAVE_ENOUGH_DATA,
    seeking: false,
    muted: false,
    isStalledFlag: false,
  };

  const cases: Array<{
    name: string;
    paused: boolean;
    networkState: number;
    readyState: number;
    seeking: boolean;
    muted: boolean;
    isStalledFlag: boolean;
    expected: string[];
  }> = [
    {
      ...baseCase,
      name: "paused element with no other states",
      paused: true,
      expected: ["paused"],
    },
    {
      ...baseCase,
      name: "playing element with sufficient data",
      expected: ["playing"],
    },
    {
      ...baseCase,
      name: "playing and buffering (loading with current data)",
      networkState: NETWORK_LOADING,
      readyState: HAVE_CURRENT_DATA,
      expected: ["playing", "buffering"],
    },
    {
      ...baseCase,
      name: "playing, buffering, and stalled",
      networkState: NETWORK_LOADING,
      readyState: HAVE_CURRENT_DATA,
      isStalledFlag: true,
      expected: ["playing", "buffering", "stalled"],
    },
    {
      ...baseCase,
      name: "all active states: playing, buffering, stalled, seeking, muted",
      networkState: NETWORK_LOADING,
      readyState: HAVE_CURRENT_DATA,
      seeking: true,
      muted: true,
      isStalledFlag: true,
      expected: ["playing", "buffering", "stalled", "seeking", "muted"],
    },
    {
      ...baseCase,
      name: "playing and seeking",
      seeking: true,
      expected: ["playing", "seeking"],
    },
    {
      ...baseCase,
      name: "paused, seeking, and muted",
      paused: true,
      seeking: true,
      muted: true,
      expected: ["paused", "seeking", "muted"],
    },
    {
      ...baseCase,
      name: "paused and muted",
      paused: true,
      muted: true,
      expected: ["paused", "muted"],
    },
    {
      ...baseCase,
      name: "playing and muted",
      muted: true,
      expected: ["playing", "muted"],
    },
  ];

  describe("invariants", () => {
    it("stalled implies buffering (stalled flag true but not loading → no stalled)", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_IDLE,
        readyState: HAVE_ENOUGH_DATA,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, true);
      expect(states.has("stalled")).toBe(false);
      expect(states.has("buffering")).toBe(false);
      expect(states.has("playing")).toBe(true);
    });

    it("buffering implies playing (paused element never buffering)", () => {
      const element = createMockElement({
        paused: true,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, false);
      expect(states.has("buffering")).toBe(false);
      expect(states.has("paused")).toBe(true);
    });

    it("playing and paused are mutually exclusive", () => {
      const playingElement = createMockElement({
        paused: false,
        networkState: NETWORK_IDLE,
        readyState: HAVE_ENOUGH_DATA,
        seeking: false,
        muted: false,
      });
      const playingStates = computeStates(playingElement, false);
      expect(playingStates.has("playing")).toBe(true);
      expect(playingStates.has("paused")).toBe(false);

      const pausedElement = createMockElement({
        paused: true,
        networkState: NETWORK_IDLE,
        readyState: HAVE_ENOUGH_DATA,
        seeking: false,
        muted: false,
      });
      const pausedStates = computeStates(pausedElement, false);
      expect(pausedStates.has("paused")).toBe(true);
      expect(pausedStates.has("playing")).toBe(false);
    });

    it("volume-locked is never returned", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
        seeking: true,
        muted: true,
      });
      const states = computeStates(element, true);
      expect(states.has("volume-locked")).toBe(false);
    });
  });

  describe("readyState boundary: buffering requires readyState <= HAVE_CURRENT_DATA", () => {
    it("HAVE_FUTURE_DATA does not trigger buffering", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_FUTURE_DATA,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, false);
      expect(states.has("buffering")).toBe(false);
    });

    it("HAVE_METADATA triggers buffering when loading", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_METADATA,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, false);
      expect(states.has("buffering")).toBe(true);
    });

    it("HAVE_NOTHING triggers buffering when loading", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_NOTHING,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, false);
      expect(states.has("buffering")).toBe(true);
    });
  });

  describe("networkState boundary: buffering requires NETWORK_LOADING", () => {
    it("NETWORK_EMPTY does not trigger buffering", () => {
      const element = createMockElement({
        paused: false,
        networkState: NETWORK_EMPTY,
        readyState: HAVE_CURRENT_DATA,
        seeking: false,
        muted: false,
      });
      const states = computeStates(element, false);
      expect(states.has("buffering")).toBe(false);
    });
  });

  // The invariant and boundary tests above verify structural rules (e.g. mutual
  // exclusivity, buffering thresholds). These cases verify that independent flags
  // like seeking and muted are detected, and that multiple states compose correctly.
  describe("state combinations", () => {
    for (const testCase of cases) {
      it(testCase.name, () => {
        const element = createMockElement({
          paused: testCase.paused,
          networkState: testCase.networkState,
          readyState: testCase.readyState,
          seeking: testCase.seeking,
          muted: testCase.muted,
        });
        const states = computeStates(element, testCase.isStalledFlag);
        expectStates(states, testCase.expected);
      });
    }
  });
});

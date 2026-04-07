import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { MEDIA_EVENTS, CLASS_PREFIX, PSEUDO_CLASSES } from "../../src/constants.js";

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

// --- Mock helpers ---

interface MockClassList {
  classes: Set<string>;
  toggle: (name: string, force: boolean) => void;
}

function createMockClassList(): MockClassList {
  const classes = new Set<string>();
  return {
    classes,
    toggle(name: string, force: boolean) {
      if (force) {
        classes.add(name);
      } else {
        classes.delete(name);
      }
    },
  };
}

interface MockMediaElement {
  paused: boolean;
  networkState: number;
  readyState: number;
  seeking: boolean;
  muted: boolean;
  tagName: string;
  nodeType: number;
  classList: MockClassList;
  listeners: Map<string, EventListener>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  querySelectorAll: (selector: string) => MockMediaElement[];
  NETWORK_EMPTY: number;
  NETWORK_IDLE: number;
  NETWORK_LOADING: number;
  NETWORK_NO_SOURCE: number;
  HAVE_NOTHING: number;
  HAVE_METADATA: number;
  HAVE_CURRENT_DATA: number;
  HAVE_FUTURE_DATA: number;
  HAVE_ENOUGH_DATA: number;
}

function createMockMediaElement(
  overrides: Partial<{
    paused: boolean;
    networkState: number;
    readyState: number;
    seeking: boolean;
    muted: boolean;
    tagName: string;
  }> = {},
): MockMediaElement {
  const classList = createMockClassList();
  const listeners = new Map<string, EventListener>();

  return {
    paused: true,
    networkState: NETWORK_IDLE,
    readyState: HAVE_ENOUGH_DATA,
    seeking: false,
    muted: false,
    tagName: "VIDEO",
    nodeType: 1,
    classList,
    listeners,
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string, _listener: EventListener) {
      listeners.delete(type);
    },
    querySelectorAll(_selector: string) {
      return [];
    },
    NETWORK_EMPTY,
    NETWORK_IDLE,
    NETWORK_LOADING,
    NETWORK_NO_SOURCE: 3,
    HAVE_NOTHING,
    HAVE_METADATA,
    HAVE_CURRENT_DATA,
    HAVE_FUTURE_DATA,
    HAVE_ENOUGH_DATA,
    ...overrides,
  } as MockMediaElement;
}

function createMockContainerElement(children: MockMediaElement[]): {
  nodeType: number;
  tagName: string;
  querySelectorAll: (selector: string) => MockMediaElement[];
} {
  return {
    nodeType: 1,
    tagName: "DIV",
    querySelectorAll(_selector: string) {
      return children;
    },
  };
}

function fireEvent(element: MockMediaElement, eventType: string): void {
  const listener = element.listeners.get(eventType);
  if (listener) {
    listener({ type: eventType } as Event);
  }
}

function getActiveClasses(element: MockMediaElement): Set<string> {
  return element.classList.classes;
}

// --- MutationObserver mock ---

let mutationCallback: MutationCallback;
let mockObserverInstance: {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
const originalMutationObserver = globalThis.MutationObserver;

function triggerMutation(records: Partial<MutationRecord>[]): void {
  mutationCallback(
    records as MutationRecord[],
    mockObserverInstance as unknown as MutationObserver,
  );
}

// --- document mock ---

let mockDocumentElements: MockMediaElement[] = [];
let mockQuerySelectorAll: ReturnType<typeof vi.fn>;
const originalDocument = globalThis.document;

// --- Tests ---

describe("observeMediaElements", () => {
  beforeEach(() => {
    mockDocumentElements = [];

    globalThis.MutationObserver = vi.fn(function MockMutationObserver(callback: MutationCallback) {
      mutationCallback = callback;
      mockObserverInstance = {
        observe: vi.fn(),
        disconnect: vi.fn(),
      };
      return mockObserverInstance;
    }) as unknown as typeof MutationObserver;

    mockQuerySelectorAll = vi.fn((_selector: string) => {
      return mockDocumentElements;
    });

    globalThis.document = {
      documentElement: { nodeType: 1 },
      querySelectorAll: mockQuerySelectorAll,
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.MutationObserver = originalMutationObserver;
    globalThis.document = originalDocument;
  });

  async function importObserve() {
    const module = await import("../../src/observe.js");
    return module.observeMediaElements as (unsupported: Set<string>) => void;
  }

  describe("initial discovery", () => {
    it("queries the document for audio and video elements", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(["playing", "paused"]));
      expect(mockQuerySelectorAll).toHaveBeenCalledWith("audio, video");
    });

    it("applies initial state classes to discovered elements", async () => {
      const element = createMockMediaElement({ paused: true });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(element.classList.classes.has(`${CLASS_PREFIX}paused`)).toBe(true);
      expect(element.classList.classes.has(`${CLASS_PREFIX}playing`)).toBe(false);
    });

    it("applies playing class when element is not paused", async () => {
      const element = createMockMediaElement({ paused: false });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(element.classList.classes.has(`${CLASS_PREFIX}playing`)).toBe(true);
      expect(element.classList.classes.has(`${CLASS_PREFIX}paused`)).toBe(false);
    });
  });

  describe("classList toggling", () => {
    it("toggles classes for all PSEUDO_CLASSES using the class prefix", async () => {
      const element = createMockMediaElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
        seeking: true,
        muted: true,
      });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      const activeClasses = getActiveClasses(element);
      expect(activeClasses.has(`${CLASS_PREFIX}buffering`)).toBe(true);
      expect(activeClasses.has(`${CLASS_PREFIX}seeking`)).toBe(true);
      expect(activeClasses.has(`${CLASS_PREFIX}muted`)).toBe(true);
      expect(activeClasses.has(`${CLASS_PREFIX}playing`)).toBe(false);
      expect(activeClasses.has(`${CLASS_PREFIX}paused`)).toBe(false);
      // volume-locked is never set by computeStates
      expect(activeClasses.has(`${CLASS_PREFIX}volume-locked`)).toBe(false);
    });

    it("only toggles classes for unsupported pseudo-classes", async () => {
      const element = createMockMediaElement({ paused: true, muted: true });
      mockDocumentElements = [element];

      // Only "paused" is unsupported; "muted" is natively supported
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(["paused"]));

      const activeClasses = getActiveClasses(element);
      expect(activeClasses.has(`${CLASS_PREFIX}paused`)).toBe(true);
      // muted is natively supported, so polyfill should not toggle it
      expect(activeClasses.has(`${CLASS_PREFIX}muted`)).toBe(false);
    });
  });

  describe("event-driven recomputation", () => {
    it("any event triggers class recomputation", async () => {
      const element = createMockMediaElement({ paused: true });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(element.classList.classes.has(`${CLASS_PREFIX}paused`)).toBe(true);

      // Change state and fire an event — classes should update
      element.paused = false;
      fireEvent(element, "play");

      expect(element.classList.classes.has(`${CLASS_PREFIX}playing`)).toBe(true);
      expect(element.classList.classes.has(`${CLASS_PREFIX}paused`)).toBe(false);
    });

    it("registers listeners for all MEDIA_EVENTS", async () => {
      const element = createMockMediaElement();
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      for (const eventType of MEDIA_EVENTS) {
        expect(element.listeners.has(eventType)).toBe(true);
      }
    });
  });

  describe("stalled flag management", () => {
    it("stalled event sets flag, enabling stalled class when buffering", async () => {
      const element = createMockMediaElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
      });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      // Initially no stalled class (flag starts false)
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(false);
      expect(element.classList.classes.has(`${CLASS_PREFIX}buffering`)).toBe(true);

      fireEvent(element, "stalled");

      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(true);
      expect(element.classList.classes.has(`${CLASS_PREFIX}buffering`)).toBe(true);
    });

    it("progress event clears stalled flag", async () => {
      const element = createMockMediaElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
      });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      fireEvent(element, "stalled");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(true);

      fireEvent(element, "progress");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(false);
    });

    it("emptied event resets stalled flag", async () => {
      const element = createMockMediaElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
      });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      fireEvent(element, "stalled");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(true);

      fireEvent(element, "emptied");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(false);
    });

    it("loadstart event resets stalled flag", async () => {
      const element = createMockMediaElement({
        paused: false,
        networkState: NETWORK_LOADING,
        readyState: HAVE_CURRENT_DATA,
      });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      fireEvent(element, "stalled");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(true);

      fireEvent(element, "loadstart");
      expect(element.classList.classes.has(`${CLASS_PREFIX}stalled`)).toBe(false);
    });
  });

  describe("MutationObserver setup", () => {
    it("creates a MutationObserver", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(globalThis.MutationObserver).toHaveBeenCalledTimes(1);
    });

    it("observes document.documentElement with correct options", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(mockObserverInstance.observe).toHaveBeenCalledWith(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  });

  describe("dynamic elements — added nodes", () => {
    it("attaches listeners when a video element is added", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      const element = createMockMediaElement({ paused: false });
      triggerMutation([
        {
          addedNodes: [element as unknown as Node] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
        },
      ]);

      expect(element.classList.classes.has(`${CLASS_PREFIX}playing`)).toBe(true);
      expect(element.listeners.size).toBe(MEDIA_EVENTS.length);
    });

    it("attaches listeners when a media element is inside an added container", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      const element = createMockMediaElement({ paused: true });
      const container = createMockContainerElement([element]);

      triggerMutation([
        {
          addedNodes: [container as unknown as Node] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
        },
      ]);

      expect(element.classList.classes.has(`${CLASS_PREFIX}paused`)).toBe(true);
      expect(element.listeners.size).toBe(MEDIA_EVENTS.length);
    });

    it("does not double-bind already-tracked elements on re-insertion", async () => {
      const element = createMockMediaElement();
      mockDocumentElements = [element];

      const addSpy = vi.fn(element.addEventListener.bind(element));
      element.addEventListener = addSpy;

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));
      const firstCallCount = addSpy.mock.calls.length;

      // Re-add the same element via mutation
      triggerMutation([
        {
          addedNodes: [element as unknown as Node] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
        },
      ]);

      expect(addSpy.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe("dynamic elements — removed nodes", () => {
    it("removes all event listeners when a video element is removed", async () => {
      const element = createMockMediaElement();
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      expect(element.listeners.size).toBe(MEDIA_EVENTS.length);

      triggerMutation([
        {
          addedNodes: [] as unknown as NodeList,
          removedNodes: [element as unknown as Node] as unknown as NodeList,
        },
      ]);

      expect(element.listeners.size).toBe(0);
    });

    it("removes listeners when a media element is inside a removed container", async () => {
      const element = createMockMediaElement();
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      const container = createMockContainerElement([element]);

      triggerMutation([
        {
          addedNodes: [] as unknown as NodeList,
          removedNodes: [container as unknown as Node] as unknown as NodeList,
        },
      ]);

      expect(element.listeners.size).toBe(0);
    });

    it("gracefully handles non-element nodes in removedNodes", async () => {
      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      const textNode = { nodeType: 3, tagName: undefined };
      const commentNode = { nodeType: 8, tagName: undefined };

      // Should not throw
      triggerMutation([
        {
          addedNodes: [] as unknown as NodeList,
          removedNodes: [
            textNode as unknown as Node,
            commentNode as unknown as Node,
          ] as unknown as NodeList,
        },
      ]);
    });

    it("allows re-binding after removal (fresh state)", async () => {
      const element = createMockMediaElement({ paused: false });
      mockDocumentElements = [element];

      const observeMediaElements = await importObserve();
      observeMediaElements(/* unsupported */ new Set(PSEUDO_CLASSES));

      // Remove
      triggerMutation([
        {
          addedNodes: [] as unknown as NodeList,
          removedNodes: [element as unknown as Node] as unknown as NodeList,
        },
      ]);

      expect(element.listeners.size).toBe(0);

      // Re-add — should get fresh listeners
      triggerMutation([
        {
          addedNodes: [element as unknown as Node] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
        },
      ]);

      expect(element.listeners.size).toBe(MEDIA_EVENTS.length);
      expect(element.classList.classes.has(`${CLASS_PREFIX}playing`)).toBe(true);
    });
  });
});

import { vi } from "vite-plus/test";
import { parse, walk, generate } from "css-tree";
import { CLASS_PREFIX, PSEUDO_CLASSES } from "../../src/constants.js";

// --- Media element constants ---

export const NETWORK_EMPTY = 0;
export const NETWORK_IDLE = 1;
export const NETWORK_LOADING = 2;

export const HAVE_NOTHING = 0;
export const HAVE_METADATA = 1;
export const HAVE_CURRENT_DATA = 2;
export const HAVE_FUTURE_DATA = 3;
export const HAVE_ENOUGH_DATA = 4;

// All pseudo-classes treated as unsupported (simulates no native support)
export const ALL_UNSUPPORTED = new Set<string>(PSEUDO_CLASSES);

// --- Mock classList ---

export interface MockClassList {
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

// --- Mock media element ---

export interface MockMediaElement {
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

export function createMockMediaElement(
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

// --- Event helpers ---

export function fireEvent(element: MockMediaElement, eventType: string): void {
  const listener = element.listeners.get(eventType);
  if (listener) {
    listener({ type: eventType } as Event);
  }
}

// --- Class assertion helpers ---

export function hasPolyfillClass(element: MockMediaElement, pseudoName: string): boolean {
  return element.classList.classes.has(`${CLASS_PREFIX}${pseudoName}`);
}

export function getActivePolyfillClasses(element: MockMediaElement): string[] {
  return [...element.classList.classes]
    .filter((className) => className.startsWith(CLASS_PREFIX))
    .map((className) => className.slice(CLASS_PREFIX.length));
}

// --- CSS assertion helpers ---

export function extractRuleSelectors(css: string): string[] {
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

// --- Environment setup ---

const originalDocument = globalThis.document;
const originalMutationObserver = globalThis.MutationObserver;

export function setupIntegrationEnvironment(elements: MockMediaElement[]): void {
  globalThis.MutationObserver = vi.fn(function MockMutationObserver(_callback: MutationCallback) {
    return {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };
  }) as unknown as typeof MutationObserver;

  globalThis.document = {
    documentElement: { nodeType: 1 },
    querySelectorAll(_selector: string) {
      return elements;
    },
  } as unknown as Document;
}

export function teardownIntegrationEnvironment(): void {
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.document = originalDocument;
}

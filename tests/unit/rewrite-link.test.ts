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

// --- Link element mock helpers ---

interface MockStyleElement {
  textContent: string | null;
  setAttribute: ReturnType<typeof vi.fn>;
}

interface MockLinkElement {
  href: string;
  disabled: boolean;
  attributes: Map<string, string>;
  hasAttribute: (name: string) => boolean;
  setAttribute: (name: string, value: string) => void;
  after: ReturnType<typeof vi.fn>;
}

function createMockLinkElement(href: string): MockLinkElement {
  const attributes = new Map<string, string>();
  return {
    href,
    disabled: false,
    attributes,
    hasAttribute(name: string) {
      return attributes.has(name);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    after: vi.fn(),
  };
}

// --- Document and global mocks ---

let mockLinkElements: MockLinkElement[] = [];
let mockQuerySelectorAll: ReturnType<typeof vi.fn>;
let mockCreatedStyle: MockStyleElement;
const originalDocument = globalThis.document;
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

function setupGlobalMocks(): void {
  mockCreatedStyle = {
    textContent: null,
    setAttribute: vi.fn(),
  };

  mockQuerySelectorAll = vi.fn((_selector: string) => {
    return mockLinkElements;
  });

  globalThis.document = {
    querySelectorAll: mockQuerySelectorAll,
    createElement: vi.fn(() => mockCreatedStyle),
  } as unknown as Document;

  globalThis.window = {
    location: { origin: "http://localhost:3000" },
  } as unknown as Window & typeof globalThis;
}

function teardownGlobalMocks(): void {
  globalThis.document = originalDocument;
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
}

function mockFetch(cssText: string): void {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      text: () => Promise.resolve(cssText),
    }),
  ) as unknown as typeof fetch;
}

function mockFetchError(): void {
  globalThis.fetch = vi.fn(() =>
    Promise.reject(new Error("Network error")),
  ) as unknown as typeof fetch;
}

// --- Tests ---

describe("isSameOrigin (via processLinkSheet)", () => {
  beforeEach(() => {
    vi.resetModules();
    setupGlobalMocks();
  });

  afterEach(() => {
    teardownGlobalMocks();
  });

  async function importProcessLinkSheet() {
    const module = await import("../../src/rewrite-link.js");
    return module.processLinkSheet as (link: unknown, unsupported: Set<string>) => Promise<void>;
  }

  it("skips external stylesheets", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("https://cdn.example.com/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(link.attributes.has("data-polyfill-rewritten")).toBe(false);
  });

  it("processes same-origin stylesheets", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3000/styles.css");
    expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
  });

  it("skips malformed URLs", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("not a url at all");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(link.attributes.has("data-polyfill-rewritten")).toBe(false);
  });
});

describe("processLinkSheet", () => {
  beforeEach(() => {
    vi.resetModules();
    setupGlobalMocks();
  });

  afterEach(() => {
    teardownGlobalMocks();
  });

  async function importProcessLinkSheet() {
    const module = await import("../../src/rewrite-link.js");
    return module.processLinkSheet as (link: unknown, unsupported: Set<string>) => Promise<void>;
  }

  it("skips already-processed links", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    link.setAttribute("data-polyfill-rewritten", "");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("skips links with empty href", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("marks link as rewritten even when no pseudo-classes found", async () => {
    mockFetch("div { color: red }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
    expect(link.after).not.toHaveBeenCalled();
    expect(link.disabled).toBe(false);
  });

  it("fetches CSS, rewrites, and injects style element", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
    expect(link.disabled).toBe(true);
    expect(link.after).toHaveBeenCalledWith(mockCreatedStyle);
    expect(mockCreatedStyle.textContent).toContain("media-pseudo-polyfill-playing");
    expect(mockCreatedStyle.setAttribute).toHaveBeenCalledWith("data-polyfill-rewritten", "");
  });

  it("preserves original rules alongside rewritten siblings", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    // rewriteCss returns both original and sibling rules
    const injected = mockCreatedStyle.textContent!;
    expect(injected).toContain("video:playing");
    expect(injected).toContain("video.media-pseudo-polyfill-playing");
  });

  it("silently skips on fetch failure", async () => {
    mockFetchError();
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    const processLinkSheet = await importProcessLinkSheet();

    await processLinkSheet(link, ALL_UNSUPPORTED);

    expect(link.attributes.has("data-polyfill-rewritten")).toBe(false);
    expect(link.after).not.toHaveBeenCalled();
  });
});

describe("rewriteLinkStylesheets", () => {
  beforeEach(() => {
    vi.resetModules();
    setupGlobalMocks();
  });

  afterEach(() => {
    teardownGlobalMocks();
  });

  async function importModule() {
    const module = await import("../../src/rewrite-link.js");
    return module.rewriteLinkStylesheets as (unsupported: Set<string>) => void;
  }

  it("queries for link[rel=stylesheet] elements", async () => {
    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(ALL_UNSUPPORTED);

    expect(mockQuerySelectorAll).toHaveBeenCalledWith(
      'link[rel="stylesheet"]:not([data-polyfill-rewritten])',
    );
  });

  it("calls processLinkSheet for each link", async () => {
    mockFetch("video:playing { color: green }");
    const link = createMockLinkElement("http://localhost:3000/styles.css");
    mockLinkElements = [link];

    const rewriteLinkStylesheets = await importModule();
    rewriteLinkStylesheets(ALL_UNSUPPORTED);

    // processLinkSheet is async — wait for it
    await vi.waitFor(() => {
      expect(link.attributes.has("data-polyfill-rewritten")).toBe(true);
    });
  });
});

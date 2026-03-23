import { describe, expect, it } from "vite-plus/test";
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

describe("rewriteCss", () => {
  describe("basic selector rewriting", () => {
    it("rewrites simple pseudo-class: video:playing", () => {
      const result = rewriteCss("video:playing { color: green }", ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe("video.media-pseudo-polyfill-playing{color:green}");
    });

    it("rewrites compound selector: video.player:playing:not(:paused)", () => {
      const result = rewriteCss(
        "video.player:playing:not(:paused) { color: green }",
        ALL_UNSUPPORTED,
      );
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(
        "video.player.media-pseudo-polyfill-playing:not(.media-pseudo-polyfill-paused){color:green}",
      );
    });

    it("rewrites nested :is()", () => {
      const result = rewriteCss("video:is(:playing, :paused) { color: green }", ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(
        "video:is(.media-pseudo-polyfill-playing,.media-pseudo-polyfill-paused){color:green}",
      );
    });

    it("rewrites :where()", () => {
      const result = rewriteCss(":where(video:playing) { color: green }", ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(":where(video.media-pseudo-polyfill-playing){color:green}");
    });

    it("rewrites :has()", () => {
      const result = rewriteCss("div:has(video:playing) { color: green }", ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe("div:has(video.media-pseudo-polyfill-playing){color:green}");
    });

    it("preserves pseudo-elements: video:playing::cue", () => {
      const result = rewriteCss("video:playing::cue { color: green }", ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe("video.media-pseudo-polyfill-playing::cue{color:green}");
    });
  });

  describe("cascade preservation", () => {
    it("maintains relative rule order", () => {
      const input = `
        video:playing { color: green }
        video { color: red }
        audio:paused { color: blue }
      `;
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      const playingIdx = normalized.indexOf("media-pseudo-polyfill-playing");
      const videoIdx = normalized.indexOf("video{color:red}");
      const pausedIdx = normalized.indexOf("media-pseudo-polyfill-paused");
      expect(playingIdx).toBeLessThan(videoIdx);
      expect(videoIdx).toBeLessThan(pausedIdx);
    });
  });

  describe("@media and @layer nesting", () => {
    it("preserves rules inside @media", () => {
      const input = "@media (min-width: 768px) { video:playing { color: green } }";
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(
        "@media (min-width:768px){video.media-pseudo-polyfill-playing{color:green}}",
      );
    });

    it("preserves rules inside @layer", () => {
      const input = "@layer base { video:playing { color: green } }";
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(
        "@layer base{video.media-pseudo-polyfill-playing{color:green}}",
      );
    });
  });

  describe(":volume-locked handling", () => {
    it("removes rule with lone :volume-locked selector", () => {
      const result = rewriteCss("video:volume-locked { color: red }", ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });

    it("prunes :volume-locked branch from selector list, preserving siblings", () => {
      const input = "video:playing, video:volume-locked { color: green }";
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("media-pseudo-polyfill-playing");
      expect(normalized).not.toContain("volume-locked");
    });

    it("removes :volume-locked argument from :is()", () => {
      const input = "video:is(:playing, :volume-locked) { color: green }";
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("media-pseudo-polyfill-playing");
      expect(normalized).not.toContain("volume-locked");
    });

    it("rewrites :volume-locked inside :not() to class selector", () => {
      const input = "video:not(:volume-locked) { color: green }";
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      expect(normalize(result!)).toBe(
        "video:not(.media-pseudo-polyfill-volume-locked){color:green}",
      );
    });
  });

  describe("no rewrites", () => {
    it("returns null when no target pseudo-classes are present", () => {
      const result = rewriteCss("video:hover { color: green }", ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });

    it("returns null for empty CSS", () => {
      const result = rewriteCss("", ALL_UNSUPPORTED);
      expect(result).toBeNull();
    });
  });

  describe("multiple rules", () => {
    it("transforms only matching rules, includes all in output", () => {
      const input = `
        video:playing { color: green }
        div { color: red }
        audio:muted { color: blue }
      `;
      const result = rewriteCss(input, ALL_UNSUPPORTED);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      expect(normalized).toContain("media-pseudo-polyfill-playing");
      expect(normalized).toContain("div{color:red}");
      expect(normalized).toContain("media-pseudo-polyfill-muted");
    });
  });

  describe("partial support", () => {
    it("only rewrites unsupported pseudo-classes", () => {
      const partialUnsupported = new Set(["buffering", "stalled"]);
      const input = "video:playing { color: green } video:buffering { color: yellow }";
      const result = rewriteCss(input, partialUnsupported);
      expect(result).not.toBeNull();
      const normalized = normalize(result!);
      // :playing is natively supported, should remain as-is
      expect(normalized).toContain("video:playing{color:green}");
      // :buffering is unsupported, should be rewritten
      expect(normalized).toContain("media-pseudo-polyfill-buffering");
    });
  });
});

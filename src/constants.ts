export const PSEUDO_CLASSES = [
  "playing",
  "paused",
  "seeking",
  "buffering",
  "stalled",
  "muted",
  "volume-locked",
] as const;

export type PseudoClassName = (typeof PSEUDO_CLASSES)[number];

export const CLASS_PREFIX = "media-pseudo-polyfill-";

export const MEDIA_EVENTS = [
  "play",
  "playing",
  "pause",
  "ended",
  "seeking",
  "seeked",
  "waiting",
  "canplay",
  "canplaythrough",
  "stalled",
  "progress",
  "volumechange",
  "emptied",
  "loadstart",
] as const;

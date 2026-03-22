import { PSEUDO_CLASSES } from "./constants.js";

export function detectUnsupported(): Set<string> {
  const unsupported = new Set<string>();

  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return new Set(PSEUDO_CLASSES);
  }

  for (const name of PSEUDO_CLASSES) {
    try {
      if (!CSS.supports(`selector(:${name})`)) {
        unsupported.add(name);
      }
    } catch {
      unsupported.add(name);
    }
  }

  return unsupported;
}

export function polyfill(): void {
  const unsupported = detectUnsupported();
  if (unsupported.size === 0) return;

  // Phase 2+: stylesheet rewriting and element observation will be added here
}

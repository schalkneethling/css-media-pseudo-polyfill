import { rewriteCss } from "./rewrite.js";

/**
 * Check whether a stylesheet URL is same-origin. The browser resolves
 * relative hrefs to absolute URLs on the HTMLLinkElement.href property,
 * so comparing the origin portion covers both relative paths and
 * absolute same-origin URLs while filtering out external CDN links.
 */
function isSameOrigin(href: string): boolean {
  try {
    const url = new URL(href);
    return url.origin === window.location.origin;
  } catch {
    // Malformed URL — treat as unsafe
    return false;
  }
}

/**
 * Fetch CSS text from a linked stylesheet, rewrite unsupported media
 * pseudo-classes to class-based selectors using the same text-based
 * sibling-injection strategy as inline <style> elements, then inject
 * the rewritten CSS as a <style> element and disable the original link.
 *
 * This avoids the CSSOM approach where the browser silently drops rules
 * with unrecognised pseudo-class selectors before the polyfill can
 * process them.
 */
export async function processLinkSheet(
  link: HTMLLinkElement,
  unsupported: Set<string>,
): Promise<void> {
  if (link.hasAttribute("data-polyfill-rewritten")) {
    return;
  }

  const href = link.href;
  if (!href || !isSameOrigin(href)) {
    return;
  }

  let cssText: string;
  try {
    const response = await fetch(href);
    cssText = await response.text();
  } catch {
    return;
  }

  const rewritten = rewriteCss(cssText, unsupported);
  link.setAttribute("data-polyfill-rewritten", "");

  if (rewritten === null) {
    return;
  }

  const style = document.createElement("style");
  style.textContent = rewritten;
  style.setAttribute("data-polyfill-rewritten", "");
  link.after(style);
  link.disabled = true;
}

/**
 * Process all <link rel="stylesheet"> elements in the document.
 * For each same-origin link, fetches the CSS text, rewrites it, and
 * injects the result as a sibling <style> element.
 *
 * @param unsupported - The set of pseudo-class names that need polyfilling.
 */
export function rewriteLinkStylesheets(unsupported: Set<string>): void {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]:not([data-polyfill-rewritten])',
  );

  for (const link of links) {
    void processLinkSheet(link, unsupported);
  }
}

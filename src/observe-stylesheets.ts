import { rewriteSingleStyleElement } from "./rewrite.js";
import { processLinkSheet } from "./rewrite-link.js";

/**
 * Tracks <style> elements currently being rewritten by the polyfill.
 * Used to distinguish polyfill-initiated textContent changes from
 * author-initiated ones, preventing infinite mutation loops.
 */
const rewritingInProgress = new WeakSet<HTMLStyleElement>();

/**
 * Check whether a node is an Element (nodeType 1).
 */
function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

/**
 * Check whether an element is a <style> element.
 */
function isStyleElement(element: Element): element is HTMLStyleElement {
  return element.tagName === "STYLE";
}

/**
 * Check whether an element is a <link rel="stylesheet">.
 */
function isStylesheetLink(element: Element): element is HTMLLinkElement {
  return element.tagName === "LINK" && element.getAttribute("rel") === "stylesheet";
}

/**
 * Rewrite a <style> element, guarding against mutation loops via the
 * rewritingInProgress WeakSet.
 */
function rewriteStyleWithGuard(style: HTMLStyleElement, unsupported: Set<string>): void {
  rewritingInProgress.add(style);
  rewriteSingleStyleElement(style, unsupported);
}

/**
 * Process a single added node: if it is (or contains) stylesheet elements,
 * rewrite them.
 */
function processAddedNode(node: Node, unsupported: Set<string>): void {
  if (!isElement(node)) {
    return;
  }

  if (isStyleElement(node) && !node.hasAttribute("data-polyfill-rewritten")) {
    rewriteStyleWithGuard(node, unsupported);
  } else if (isStylesheetLink(node) && !node.hasAttribute("data-polyfill-rewritten")) {
    processLinkElement(node, unsupported);
  }

  // Also check for nested stylesheet elements inside containers
  for (const style of node.querySelectorAll<HTMLStyleElement>(
    "style:not([data-polyfill-rewritten])",
  )) {
    rewriteStyleWithGuard(style, unsupported);
  }
  for (const link of node.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]:not([data-polyfill-rewritten])',
  )) {
    processLinkElement(link, unsupported);
  }
}

/**
 * Handle a childList mutation whose target is a <style> element.
 * This fires when textContent is replaced (old Text child removed, new added).
 */
function handleStyleChildListMutation(style: HTMLStyleElement, unsupported: Set<string>): void {
  if (rewritingInProgress.has(style)) {
    rewritingInProgress.delete(style);
    return;
  }

  // Author-initiated content change — re-process
  style.removeAttribute("data-polyfill-rewritten");
  rewriteStyleWithGuard(style, unsupported);
}

/**
 * Handle a characterData mutation on a text node inside a <style> element.
 * This fires when the author modifies the text node directly
 * (e.g., style.firstChild.data = "...").
 */
function handleCharacterDataMutation(target: Node, unsupported: Set<string>): void {
  const parent = (target as ChildNode).parentElement;
  if (!parent || !isStyleElement(parent)) {
    return;
  }

  if (rewritingInProgress.has(parent)) {
    rewritingInProgress.delete(parent);
    return;
  }

  // Author-initiated text node change — re-process
  parent.removeAttribute("data-polyfill-rewritten");
  rewriteStyleWithGuard(parent, unsupported);
}

/**
 * Process a <link rel="stylesheet"> element. processLinkSheet handles
 * fetching the CSS text directly, so no load-event deferral is needed.
 */
function processLinkElement(link: HTMLLinkElement, unsupported: Set<string>): void {
  processLinkSheet(link, unsupported);
}

/**
 * Observe the DOM for dynamically added or mutated stylesheets and
 * rewrite them to polyfill unsupported media pseudo-classes.
 */
export function observeStylesheets(unsupported: Set<string>): void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") {
        const target = record.target;
        if (
          isElement(target) &&
          isStyleElement(target) &&
          target.hasAttribute("data-polyfill-rewritten")
        ) {
          handleStyleChildListMutation(target, unsupported);
          continue;
        }

        for (const node of record.addedNodes) {
          processAddedNode(node, unsupported);
        }
      } else if (record.type === "characterData") {
        handleCharacterDataMutation(record.target, unsupported);
      } else if (record.type === "attributes") {
        const target = record.target;
        if (isElement(target) && isStylesheetLink(target)) {
          target.removeAttribute("data-polyfill-rewritten");
          processLinkSheet(target, unsupported);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href"],
  });
}

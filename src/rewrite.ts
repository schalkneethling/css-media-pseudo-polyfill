import { parse, clone, walk, generate } from "css-tree";
import type { CssNode, ListItem, SelectorList } from "css-tree";
import { CLASS_PREFIX } from "./constants.js";

/**
 * Rewrite CSS text, replacing unsupported media pseudo-class selectors
 * with equivalent class selectors. Returns null if no rewrites occurred.
 */
export function rewriteCss(cssText: string, unsupported: Set<string>): string | null {
  const ast = parse(cssText);
  const cloned = clone(ast);
  let rewrote = false;

  // Pass 1: Rewrite all unsupported pseudo-class selectors to class selectors,
  // except :volume-locked which needs special handling (pass 2).
  walk(cloned, {
    visit: "PseudoClassSelector",
    enter(node, item, list) {
      if (!unsupported.has(node.name)) {
        return;
      }

      if (node.name === "volume-locked") {
        return;
      }

      rewrote = true;
      const replacement = list.createItem({
        type: "ClassSelector",
        name: `${CLASS_PREFIX}${node.name}`,
        loc: node.loc,
      } as CssNode);
      list.replace(item, replacement);
    },
  });

  // Pass 2: Handle :volume-locked
  if (unsupported.has("volume-locked")) {
    const volumeLockedRewrote = handleVolumeLocked(cloned);

    if (volumeLockedRewrote) {
      rewrote = true;
    }
  }

  if (!rewrote) {
    return null;
  }

  const output = generate(cloned);
  if (!output.trim()) {
    return null;
  }

  return output;
}

/**
 * Handle :volume-locked pseudo-class. Although unpolyfillable, it cannot be
 * left as-is in the rewritten stylesheet: in a comma-separated selector list,
 * one invalid selector causes the browser to discard the entire rule — breaking
 * sibling selectors that were successfully rewritten.
 *
 * - In a selector list → prune the :volume-locked branch
 * - Lone selector in a rule → remove entire rule
 * - Inside :is()/:where() → prune from argument list (cosmetic; forgiving parsing handles it)
 * - Inside :not() → rewrite to class selector (matches everything, consistent)
 */
function handleVolumeLocked(ast: CssNode): boolean {
  let rewrote = false;

  // Rewrite :volume-locked inside :not() to a class selector
  walk(ast, {
    visit: "PseudoClassSelector",
    enter(node) {
      if (node.name !== "not" || !node.children) {
        return;
      }
      walk(node, {
        visit: "PseudoClassSelector",
        enter(inner, innerItem, innerList) {
          if (inner.name !== "volume-locked") {
            return;
          }
          rewrote = true;
          const replacement = innerList.createItem({
            type: "ClassSelector",
            name: `${CLASS_PREFIX}volume-locked`,
            loc: inner.loc,
          } as CssNode);
          innerList.replace(innerItem, replacement);
        },
      });
    },
  });

  // Prune :volume-locked from :is()/:where() argument lists
  walk(ast, {
    visit: "PseudoClassSelector",
    enter(node) {
      if (node.name !== "is" && node.name !== "where") {
        return;
      }
      if (!node.children) {
        return;
      }
      const selectorList = node.children.first as SelectorList | null;
      if (selectorList?.type === "SelectorList") {
        if (pruneSelectorsWithVolumeLocked(selectorList)) {
          rewrote = true;
        }
      }
    },
  });

  // Prune :volume-locked from top-level selector lists and remove empty rules
  walk(ast, {
    visit: "Rule",
    enter(_node, item, list) {
      const prelude = _node.prelude as SelectorList;
      if (prelude.type !== "SelectorList") {
        return;
      }

      if (pruneSelectorsWithVolumeLocked(prelude)) {
        rewrote = true;
      }

      if (prelude.children.isEmpty) {
        list.remove(item);
      }
    },
  });

  return rewrote;
}

function containsVolumeLocked(node: CssNode): boolean {
  let found = false;
  walk(node, {
    visit: "PseudoClassSelector",
    enter(node) {
      if (node.name === "volume-locked") {
        found = true;
        return this.break;
      }
    },
  });
  return found;
}

function pruneSelectorsWithVolumeLocked(selectorList: SelectorList): boolean {
  const toRemove: ListItem<CssNode>[] = [];

  selectorList.children.forEach((selector: CssNode, selectorItem: ListItem<CssNode>) => {
    if (containsVolumeLocked(selector)) {
      toRemove.push(selectorItem);
    }
  });

  for (const selectorItem of toRemove) {
    selectorList.children.remove(selectorItem);
  }
  return toRemove.length > 0;
}

/**
 * Process all inline <style> elements in the document.
 * For each that contains target pseudo-classes, injects a rewritten
 * <style> after it and disables the original.
 */
export function rewriteStyleElements(unsupported: Set<string>): void {
  const styles = document.querySelectorAll<HTMLStyleElement>("style:not([data-polyfill-source])");

  for (const style of styles) {
    const cssText = style.textContent;
    if (!cssText) {
      continue;
    }

    const rewritten = rewriteCss(cssText, unsupported);
    if (rewritten === null) {
      continue;
    }

    const injected = document.createElement("style");
    injected.setAttribute("data-polyfill-source", "");
    injected.textContent = rewritten;

    style.after(injected);

    if (style.sheet) {
      style.sheet.disabled = true;
    }
  }
}

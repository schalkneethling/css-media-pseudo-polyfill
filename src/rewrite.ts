import { parse, clone, walk, generate } from "css-tree";
import type { CssNode, ListItem, List, SelectorList, Rule } from "css-tree";
import { CLASS_PREFIX } from "./constants.js";

/**
 * Rewrite CSS text using immediate-sibling injection. For each rule containing
 * an unsupported media pseudo-class selector, a class-based equivalent is
 * inserted as a sibling rule immediately after the original. The original rules
 * are preserved — the browser silently skips rules it does not understand and
 * applies the class-based fallback. Returns null if no rewrites occurred.
 */
export function rewriteCss(cssText: string, unsupported: Set<string>): string | null {
  const ast = parse(cssText);
  let rewrote = false;

  // Walk rules and inject class-based siblings after matching ones.
  // We walk the AST visiting Rule nodes. For each rule that contains a target
  // pseudo-class, we clone it, rewrite the clone's selectors, and insert the
  // clone as a sibling immediately after the original.
  injectSiblingRules(ast, unsupported, (didRewrite) => {
    if (didRewrite) {
      rewrote = true;
    }
  });

  if (!rewrote) {
    return null;
  }

  const output = generate(ast);
  if (!output.trim()) {
    return null;
  }

  return output;
}

/**
 * Walk the AST looking for Rule nodes that contain target pseudo-classes.
 * For each match, clone the rule, rewrite selectors in the clone, and
 * insert the clone immediately after the original in the parent list.
 */
function injectSiblingRules(
  ast: CssNode,
  unsupported: Set<string>,
  onRewrite: (didRewrite: boolean) => void,
): void {
  // Collect rules to process first to avoid mutating the list during traversal.
  const rulesToProcess: Array<{ rule: Rule; item: ListItem<CssNode>; list: List<CssNode> }> = [];

  walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      if (containsTargetPseudoClass(node, unsupported)) {
        rulesToProcess.push({ rule: node, item, list });
      }
    },
  });

  for (const { rule, item, list } of rulesToProcess) {
    const cloned = clone(rule) as Rule;

    const prelude = cloned.prelude as SelectorList;
    if (prelude.type !== "SelectorList") {
      continue;
    }

    const cloneRewrote = rewriteSelectorList(prelude, unsupported);

    if (!cloneRewrote) {
      continue;
    }

    // Check if the selector list is empty after volume-locked pruning
    if (prelude.children.isEmpty) {
      continue;
    }

    // Insert the cloned rule immediately after the original
    const newItem = list.createItem(cloned as CssNode);
    if (item.next) {
      list.insert(newItem, item.next);
    } else {
      list.appendData(cloned as CssNode);
    }

    onRewrite(true);
  }
}

/**
 * Check whether a CSS node contains any target pseudo-class selectors.
 */
export function containsTargetPseudoClass(node: CssNode, unsupported: Set<string>): boolean {
  let found = false;
  walk(node, {
    visit: "PseudoClassSelector",
    enter(pseudoNode) {
      if (unsupported.has(pseudoNode.name)) {
        found = true;
        return this.break;
      }
    },
  });
  return found;
}

/**
 * Rewrite pseudo-class selectors to class selectors in a SelectorList node,
 * mutating it in place. Handles :volume-locked pruning and :not() rewriting.
 * Returns whether any rewrites occurred.
 *
 * Used by both the <style> text rewriting path and the <link> CSSOM path.
 */
export function rewriteSelectorList(selectorList: SelectorList, unsupported: Set<string>): boolean {
  let rewrote = false;

  // Rewrite non-volume-locked pseudo-classes to class selectors
  walk(selectorList, {
    visit: "PseudoClassSelector",
    enter(node, pseudoItem, pseudoList) {
      if (!unsupported.has(node.name)) {
        return;
      }

      if (node.name === "volume-locked") {
        return;
      }

      rewrote = true;
      const replacement = pseudoList.createItem({
        type: "ClassSelector",
        name: `${CLASS_PREFIX}${node.name}`,
        loc: node.loc,
      } as CssNode);
      pseudoList.replace(pseudoItem, replacement);
    },
  });

  // Handle :volume-locked
  if (unsupported.has("volume-locked")) {
    if (handleVolumeLocked(selectorList)) {
      rewrote = true;
    }
  }

  return rewrote;
}

/**
 * Handle :volume-locked pseudo-class in a selector list. Although unpolyfillable,
 * it cannot be left as-is in the sibling rule: in a comma-separated selector
 * list, one invalid selector causes the browser to discard the entire rule —
 * breaking sibling selectors that were successfully rewritten.
 *
 * - In a selector list → prune the :volume-locked branch
 * - Lone selector → list becomes empty (caller skips injection)
 * - Inside :is()/:where() → prune from argument list
 * - Inside :not() → rewrite to class selector (matches everything, consistent)
 */
function handleVolumeLocked(selectorList: SelectorList): boolean {
  let rewrote = false;

  // Rewrite :volume-locked inside :not() to a class selector
  walk(selectorList, {
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
  walk(selectorList, {
    visit: "PseudoClassSelector",
    enter(node) {
      if (node.name !== "is" && node.name !== "where") {
        return;
      }
      if (!node.children) {
        return;
      }
      const nestedSelectorList = node.children.first as SelectorList | null;
      if (nestedSelectorList?.type === "SelectorList") {
        if (pruneSelectorsWithVolumeLocked(nestedSelectorList)) {
          rewrote = true;
        }
      }
    },
  });

  // Prune :volume-locked from top-level selector list
  if (pruneSelectorsWithVolumeLocked(selectorList)) {
    rewrote = true;
  }

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
 * For each that contains target pseudo-classes, replaces its content
 * with the rewritten CSS (originals plus class-based siblings).
 */
export function rewriteStyleElements(unsupported: Set<string>): void {
  const styles = document.querySelectorAll<HTMLStyleElement>(
    "style:not([data-polyfill-rewritten])",
  );

  for (const style of styles) {
    const cssText = style.textContent;
    if (!cssText) {
      continue;
    }

    const rewritten = rewriteCss(cssText, unsupported);
    if (rewritten === null) {
      continue;
    }

    style.textContent = rewritten;
    style.setAttribute("data-polyfill-rewritten", "");
  }
}

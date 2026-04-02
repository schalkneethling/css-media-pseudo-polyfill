import { parse, generate } from "css-tree";
import type { SelectorList } from "css-tree";
import { rewriteSelectorList, containsTargetPseudoClass } from "./rewrite.js";

const STYLE_RULE_TYPE = 1;

/**
 * Parse a selector string, rewrite unsupported media pseudo-classes to
 * class selectors. Returns the rewritten selector string, or null if no
 * rewrites occurred or all selectors were pruned (e.g., lone :volume-locked).
 *
 * @param selectorText - The CSS selector string to rewrite.
 * @param unsupported - The set of pseudo-class names that need polyfilling.
 */
export function rewriteSelector(selectorText: string, unsupported: Set<string>): string | null {
  const selectorList = parse(selectorText, {
    context: "selectorList",
  }) as SelectorList;

  // Check if this selector contains any target pseudo-classes first
  if (!containsTargetPseudoClass(selectorList, unsupported)) {
    return null;
  }

  const rewrote = rewriteSelectorList(selectorList, unsupported);

  if (!rewrote) {
    return null;
  }

  // All selectors may have been pruned (e.g., lone :volume-locked)
  if (selectorList.children.isEmpty) {
    return null;
  }

  return generate(selectorList);
}

/**
 * Determines whether a CSSOM rule is a grouping rule (CSSMediaRule,
 * CSSSupportsRule, CSSLayerBlockRule) that contains nested cssRules.
 */
function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  return "cssRules" in rule && "insertRule" in rule;
}

/**
 * Walk the cssRules of a CSSStyleSheet or CSSGroupingRule, inserting
 * class-based sibling rules after each matching CSSStyleRule. Recurses
 * into nested at-rules (CSSMediaRule, CSSSupportsRule, CSSLayerBlockRule).
 *
 * @param ruleContainer - The stylesheet or grouping rule to walk.
 * @param unsupported - The set of pseudo-class names that need polyfilling.
 * @returns Whether any rules were rewritten.
 */
export function rewriteCssomRules(
  ruleContainer: CSSStyleSheet | CSSGroupingRule,
  unsupported: Set<string>,
): boolean {
  let rewrote = false;
  const ruleCount = ruleContainer.cssRules.length;
  let insertionOffset = 0;

  for (let index = 0; index < ruleCount; index++) {
    const adjustedIndex = index + insertionOffset;
    const rule = ruleContainer.cssRules[adjustedIndex];

    // Recurse into grouping rules (@media, @supports, @layer)
    if (isGroupingRule(rule)) {
      if (rewriteCssomRules(rule, unsupported)) {
        rewrote = true;
      }
      continue;
    }

    // Only process style rules
    if (rule.type !== STYLE_RULE_TYPE) {
      continue;
    }

    const styleRule = rule as CSSStyleRule;
    const rewrittenSelector = rewriteSelector(styleRule.selectorText, unsupported);

    if (rewrittenSelector === null) {
      continue;
    }

    const newRuleText = `${rewrittenSelector} { ${styleRule.style.cssText} }`;
    ruleContainer.insertRule(newRuleText, adjustedIndex + 1);
    insertionOffset += 1;
    rewrote = true;
  }

  return rewrote;
}

/**
 * Process a single link element's stylesheet via CSSOM.
 * Guards against double-processing and cross-origin SecurityError.
 */
export function processLinkSheet(link: HTMLLinkElement, unsupported: Set<string>): void {
  if (link.hasAttribute("data-polyfill-rewritten")) {
    return;
  }

  let sheet: CSSStyleSheet;
  try {
    // Non-null assertion is safe: callers only invoke processLinkSheet
    // after confirming link.sheet !== null or after the "load" event fires.
    sheet = link.sheet!;
    // Accessing cssRules on a cross-origin sheet throws SecurityError
    void sheet.cssRules;
  } catch {
    return;
  }

  rewriteCssomRules(sheet, unsupported);
  link.setAttribute("data-polyfill-rewritten", "");
}

/**
 * Process all same-origin <link rel="stylesheet"> elements in the document.
 * For each accessible sheet, rewrites rules via CSSOM. Defers processing
 * for sheets not yet loaded via a one-time load event listener.
 *
 * @param unsupported - The set of pseudo-class names that need polyfilling.
 */
export function rewriteLinkStylesheets(unsupported: Set<string>): void {
  const links = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]:not([data-polyfill-rewritten])',
  );

  for (const link of links) {
    if (link.sheet !== null) {
      processLinkSheet(link, unsupported);
    } else {
      link.addEventListener(
        "load",
        () => {
          processLinkSheet(link, unsupported);
        },
        { once: true },
      );
    }
  }
}

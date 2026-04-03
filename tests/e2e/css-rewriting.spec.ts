import { test, expect } from "@playwright/test";

test.describe("CSS rewriting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("inline style element is marked as rewritten", async ({ page }) => {
    // The page has two rewritten styles: the original inline <style> and the
    // injected <style> from the linked stylesheet. Target the inline one by
    // excluding the injected style (which appears before it in DOM order).
    const inlineStyle = page.locator("style[data-polyfill-rewritten]").last();
    await expect(inlineStyle).toBeAttached();
  });

  test("linked stylesheet link element is marked as rewritten", async ({ page }) => {
    const rewrittenLink = page.locator("link[data-polyfill-rewritten]");
    await expect(rewrittenLink).toBeAttached();
  });

  test("inline style contains class-based sibling rules for video pseudo-classes", async ({
    page,
  }) => {
    const hasPolyfillSelectors = await page.evaluate(() => {
      // The inline style is the last <style> in <head>
      const styles = document.querySelectorAll("style[data-polyfill-rewritten]");
      for (const style of styles) {
        const text = style.textContent ?? "";
        if (text.includes(":root") && text.includes(".media-pseudo-polyfill-")) {
          return true;
        }
      }
      return false;
    });

    expect(hasPolyfillSelectors).toBe(true);
  });

  test("linked stylesheet is rewritten into an injected style element", async ({ page }) => {
    const hasPolyfillRules = await page.evaluate(() => {
      // The polyfill injects a <style> with the rewritten linked CSS and
      // disables the original <link>. Find the injected style containing
      // audio pseudo-class rewrites.
      const styles = document.querySelectorAll("style[data-polyfill-rewritten]");
      for (const style of styles) {
        const text = style.textContent ?? "";
        if (text.includes(".media-pseudo-polyfill-") && text.includes("audio")) {
          return true;
        }
      }
      return false;
    });

    expect(hasPolyfillRules).toBe(true);
  });
});

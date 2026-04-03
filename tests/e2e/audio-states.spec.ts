import { test, expect } from "@playwright/test";

test.describe("audio state transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("audio-cathedral")).toBeAttached();
  });

  test("audio starts paused with paused badge visible", async ({ page }) => {
    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("opacity", "0");
  });

  test("playing audio shows the playing badge and hides the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        audio.play();
      });
    });

    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("opacity", "0");
  });

  test("pausing audio shows the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        audio.play();
      });
    });

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("pause", () => resolve(), { once: true });
        audio.pause();
      });
    });

    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("opacity", "0");
  });

  test("muting audio shows the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("opacity", "1");
  });

  test("unmuting audio hides the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("opacity", "1");

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = false;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("opacity", "0");
  });

  test("playing audio gives the card a gold border", async ({ page }) => {
    const card = page.locator(".audio-card", { has: page.getByTestId("audio-cathedral") });

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        audio.play();
      });
    });

    await expect(card).toHaveCSS("border-color", "rgb(201, 148, 62)");
  });

  test("muting audio dims the equalizer bars", async ({ page }) => {
    const eqBar = page
      .locator(".audio-card", { has: page.getByTestId("audio-cathedral") })
      .locator(".eq-bar")
      .first();

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(eqBar).toHaveCSS("opacity", "0.2");
  });
});

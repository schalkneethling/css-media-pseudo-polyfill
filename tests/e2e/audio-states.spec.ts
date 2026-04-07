import { test, expect } from "@playwright/test";

test.describe("audio state transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("audio-cathedral")).toBeAttached();
  });

  test("audio starts paused with paused badge visible", async ({ page }) => {
    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("display", "none");
  });

  test("playing audio shows the playing badge and hides the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        void audio.play();
      });
    });

    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("display", "none");
  });

  test("pausing audio shows the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        void audio.play();
      });
    });

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("pause", () => resolve(), { once: true });
        audio.pause();
      });
    });

    await expect(page.getByTestId("audio-cathedral-paused")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("display", "none");
  });

  test("muting audio shows the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("display", "inline-flex");
  });

  test("unmuting audio hides the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("display", "inline-flex");

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = false;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toHaveCSS("display", "none");
  });

  test("playing audio gives the card a gold border", async ({ page }) => {
    const card = page.locator(".audio-card", { has: page.getByTestId("audio-cathedral") });

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        void audio.play();
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

  test("buffering and stalled badges are hidden by default", async ({ page }) => {
    await expect(page.getByTestId("audio-cathedral-buffering")).toHaveCSS("display", "none");
    await expect(page.getByTestId("audio-cathedral-stalled")).toHaveCSS("display", "none");
  });

  test("buffering badge shown and playing badge hidden when buffering class is active", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.classList.add("media-pseudo-polyfill-playing");
      audio.classList.add("media-pseudo-polyfill-buffering");
      audio.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("audio-cathedral-buffering")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("display", "none");
  });

  test("stalled badge shown when stalled class is active", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.classList.add("media-pseudo-polyfill-playing");
      audio.classList.add("media-pseudo-polyfill-buffering");
      audio.classList.add("media-pseudo-polyfill-stalled");
      audio.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("audio-cathedral-stalled")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-buffering")).toHaveCSS("display", "inline-flex");
    await expect(page.getByTestId("audio-cathedral-playing")).toHaveCSS("display", "none");
  });
});

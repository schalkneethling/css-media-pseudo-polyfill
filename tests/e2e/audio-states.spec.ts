import { test, expect } from "@playwright/test";

test.describe("audio state transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("audio-cathedral")).toBeAttached();
  });

  test("audio starts paused with paused badge visible", async ({ page }) => {
    await expect(page.getByTestId("audio-cathedral-paused")).toBeVisible();
    await expect(page.getByTestId("audio-cathedral-playing")).not.toBeVisible();
  });

  test("playing audio shows the playing badge and hides the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      return new Promise<void>((resolve) => {
        audio.addEventListener("playing", () => resolve(), { once: true });
        void audio.play();
      });
    });

    await expect(page.getByTestId("audio-cathedral-playing")).toBeVisible();
    await expect(page.getByTestId("audio-cathedral-paused")).not.toBeVisible();
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

    await expect(page.getByTestId("audio-cathedral-paused")).toBeVisible();
    await expect(page.getByTestId("audio-cathedral-playing")).not.toBeVisible();
  });

  test("muting audio shows the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toBeVisible();
  });

  test("unmuting audio hides the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = true;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).toBeVisible();

    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.muted = false;
    });

    await expect(page.getByTestId("audio-cathedral-muted")).not.toBeVisible();
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
    await expect(page.getByTestId("audio-cathedral-buffering")).not.toBeVisible();
    await expect(page.getByTestId("audio-cathedral-stalled")).not.toBeVisible();
  });

  test("buffering badge shown and playing badge hidden when buffering class is active", async ({
    page,
  }) => {
    // The polyfill treats buffering and playing as mutually exclusive.
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.classList.add("media-pseudo-polyfill-buffering");
      audio.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("audio-cathedral-buffering")).toBeVisible();
    await expect(page.getByTestId("audio-cathedral-playing")).not.toBeVisible();
  });

  test("stalled badge shown and buffering badge hidden when stalled class is active", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const audio = document.querySelector<HTMLAudioElement>('[data-testid="audio-cathedral"]')!;
      audio.classList.add("media-pseudo-polyfill-stalled");
      audio.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("audio-cathedral-stalled")).toBeVisible();
    await expect(page.getByTestId("audio-cathedral-buffering")).not.toBeVisible();
    await expect(page.getByTestId("audio-cathedral-playing")).not.toBeVisible();
  });
});

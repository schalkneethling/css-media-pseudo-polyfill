import { test, expect } from "@playwright/test";

test.describe("video state transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("video-beach")).toBeVisible();
  });

  test("video starts paused with paused badge visible", async ({ page }) => {
    await expect(page.getByTestId("video-beach-paused")).toBeVisible();
    await expect(page.getByTestId("video-beach-playing")).not.toBeVisible();
  });

  test("playing a video shows the playing badge and hides the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      return new Promise<void>((resolve) => {
        video.addEventListener("playing", () => resolve(), { once: true });
        void video.play();
      });
    });

    await expect(page.getByTestId("video-beach-playing")).toBeVisible();
    await expect(page.getByTestId("video-beach-paused")).not.toBeVisible();
  });

  test("pausing a playing video shows the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      return new Promise<void>((resolve) => {
        video.addEventListener("playing", () => resolve(), { once: true });
        void video.play();
      });
    });

    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      return new Promise<void>((resolve) => {
        video.addEventListener("pause", () => resolve(), { once: true });
        video.pause();
      });
    });

    await expect(page.getByTestId("video-beach-paused")).toBeVisible();
    await expect(page.getByTestId("video-beach-playing")).not.toBeVisible();
  });

  test("muting a video shows the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = true;
    });

    await expect(page.getByTestId("video-beach-muted")).toBeVisible();
  });

  test("unmuting a video hides the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = true;
    });

    await expect(page.getByTestId("video-beach-muted")).toBeVisible();

    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = false;
    });

    await expect(page.getByTestId("video-beach-muted")).not.toBeVisible();
  });

  test("seeking applies the polyfill seeking class", async ({ page }) => {
    // Wait for media to be ready before seeking
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        return;
      }
      return new Promise<void>((resolve) => {
        video.addEventListener("canplay", () => resolve(), { once: true });
      });
    });

    // The seeking state is transient — capture the class during the seeking
    // window by listening for the seeking event and checking immediately.
    const hadSeekingClass = await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      return new Promise<boolean>((resolve) => {
        video.addEventListener(
          "seeking",
          () => {
            resolve(video.classList.contains("media-pseudo-polyfill-seeking"));
          },
          { once: true },
        );
        video.currentTime = 1;
      });
    });

    expect(hadSeekingClass).toBe(true);
  });

  test("buffering and stalled badges are hidden by default", async ({ page }) => {
    await expect(page.getByTestId("video-beach-buffering")).not.toBeVisible();
    await expect(page.getByTestId("video-beach-stalled")).not.toBeVisible();
  });

  test("buffering badge shown and playing badge hidden when buffering class is active", async ({
    page,
  }) => {
    // Simulate the polyfill setting buffering state by toggling classes directly.
    // In a real scenario this happens when networkState is LOADING and readyState
    // is low, but those properties are read-only in the browser.
    // The polyfill treats buffering and playing as mutually exclusive.
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.classList.add("media-pseudo-polyfill-buffering");
      video.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("video-beach-buffering")).toBeVisible();
    await expect(page.getByTestId("video-beach-playing")).not.toBeVisible();
  });

  test("stalled badge shown and buffering badge hidden when stalled class is active", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.classList.add("media-pseudo-polyfill-stalled");
      video.classList.remove("media-pseudo-polyfill-paused");
    });

    await expect(page.getByTestId("video-beach-stalled")).toBeVisible();
    await expect(page.getByTestId("video-beach-buffering")).not.toBeVisible();
    await expect(page.getByTestId("video-beach-playing")).not.toBeVisible();
  });
});

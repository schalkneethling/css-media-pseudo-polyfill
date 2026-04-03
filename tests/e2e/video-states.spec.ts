import { test, expect } from "@playwright/test";

test.describe("video state transitions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("video-beach")).toBeVisible();
  });

  test("video starts paused with paused badge visible", async ({ page }) => {
    await expect(page.getByTestId("video-beach-paused")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("video-beach-playing")).toHaveCSS("opacity", "0");
  });

  test("playing a video shows the playing badge and hides the paused badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      return new Promise<void>((resolve) => {
        video.addEventListener("playing", () => resolve(), { once: true });
        void video.play();
      });
    });

    await expect(page.getByTestId("video-beach-playing")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("video-beach-paused")).toHaveCSS("opacity", "0");
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

    await expect(page.getByTestId("video-beach-paused")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("video-beach-playing")).toHaveCSS("opacity", "0");
  });

  test("muting a video shows the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = true;
    });

    await expect(page.getByTestId("video-beach-muted")).toHaveCSS("opacity", "1");
  });

  test("unmuting a video hides the muted badge", async ({ page }) => {
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = true;
    });

    await expect(page.getByTestId("video-beach-muted")).toHaveCSS("opacity", "1");

    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>('[data-testid="video-beach"]')!;
      video.muted = false;
    });

    await expect(page.getByTestId("video-beach-muted")).toHaveCSS("opacity", "0");
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
});

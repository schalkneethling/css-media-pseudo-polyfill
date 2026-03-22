import { polyfill } from "./polyfill.js";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => polyfill());
} else {
  polyfill();
}

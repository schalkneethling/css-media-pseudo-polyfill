import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    dts: {
      tsgo: true,
    },
    entry: {
      index: "src/index.ts",
      fn: "src/index-fn.ts",
    },
    exports: true,
  },
  lint: { options: { typeAware: true, typeCheck: true } },
});

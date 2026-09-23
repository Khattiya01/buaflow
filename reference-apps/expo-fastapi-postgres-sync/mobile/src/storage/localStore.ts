// Generic fallback used only by tools that don't understand Metro's platform-extension
// resolution (tsc, vitest). Metro itself always prefers localStore.native.ts or
// localStore.web.ts over this file when bundling the actual app — see ./types.ts.
export { webStore as localStore } from "./webStore";

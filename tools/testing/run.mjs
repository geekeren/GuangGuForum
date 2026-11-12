import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Preserve repository-relative fixtures while resolving Vitest's Vite peer here.
const require = createRequire(import.meta.url);
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
await import(pathToFileURL(join(dirname(require.resolve("vitest/package.json")), "vitest.mjs")).href);

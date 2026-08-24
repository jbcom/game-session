#!/usr/bin/env node
// Minimal build: tsc emits ESM + .d.ts, esbuild transpiles the same sources to CJS.
// No bundler — each source module maps 1:1 to a dist module (matches how the
// package's subpath exports are structured: index/react/ui).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

// 1. ESM + type declarations via tsc (respects tsconfig.json in this package).
execFileSync("pnpm", ["exec", "tsc", "-p", path.join(root, "tsconfig.json")], {
  cwd: root,
  stdio: "inherit",
});

// 2. CJS via esbuild, one entry point per top-level src module.
const entryPoints = readdirSync(srcDir)
  .filter(
    (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx")
  )
  .map((file) => path.join(srcDir, file));

await esbuild.build({
  entryPoints,
  outdir: distDir,
  outExtension: { ".js": ".cjs" },
  format: "cjs",
  platform: "neutral",
  target: "es2022",
  bundle: false,
  sourcemap: false,
  jsx: "automatic",
  logLevel: "info",
});

// 3. Declarations for the CJS half. tsc emits only `.d.ts`, which Node resolves
// as ESM because package.json says `"type": "module"` -- so a `require()`
// consumer got types that claimed to be ESM while the runtime file was CJS
// (arethetypeswrong: "Masquerading as ESM"). The declaration content is
// identical; only the extension tells Node which module format it describes.
const declarations = readdirSync(distDir).filter(
  (file) => file.endsWith(".d.ts") && !file.endsWith(".d.cts")
);
for (const file of declarations) {
  copyFileSync(path.join(distDir, file), path.join(distDir, file.replace(/\.d\.ts$/, ".d.cts")));
}

console.log(
  `Built ${entryPoints.length} entry point(s) -> dist/ (ESM+d.ts via tsc, CJS+d.cts via esbuild)`
);

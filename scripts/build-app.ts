/**
 * Local, deterministic replica of the platform's app compiler.
 *
 * The Vellum host builds `apps/<app>/src` into the sibling `apps/<app>/dist`
 * itself (assistant `bundler/app-compiler.ts`), with esbuild pinned at the
 * version this repo pins in devDependencies, and it excludes that dist from
 * install and drift fingerprints — dist is generated output, never tracked
 * source. This script runs the same esbuild invocation and the same
 * index.html tag injection, so a clean local build reproduces what the host
 * ships and the test suite can verify the artifact is a pure function of
 * reviewed source.
 *
 * Usage: `bun scripts/build-app.ts` (builds apps/taste/src → apps/taste/dist).
 * The reproducibility test imports {@link buildApp} to build into temp dirs.
 */

import { existsSync, rmSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");
const ESBUILD_BIN = join(REPO_ROOT, "node_modules", ".bin", "esbuild");

/** Compile `appDir`'s src into `distDir` with the platform's exact flags. */
export async function buildApp(appDir: string, distDir: string): Promise<void> {
  const srcDir = join(appDir, "src");
  const entryPoint = join(srcDir, "main.tsx");
  if (!existsSync(entryPoint)) {
    throw new Error(`App has no src/main.tsx at ${entryPoint}`);
  }

  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }
  await mkdir(distDir, { recursive: true });

  const args = [
    entryPoint,
    "--bundle",
    "--minify",
    `--outdir=${distDir}`,
    "--format=esm",
    "--target=es2022",
    "--jsx=automatic",
    "--jsx-import-source=preact",
    "--alias:react=preact/compat",
    "--alias:react-dom=preact/compat",
    "--loader:.tsx=tsx",
    "--loader:.ts=ts",
    "--loader:.jsx=jsx",
    "--loader:.js=js",
    "--loader:.css=css",
    "--log-level=warning",
  ];

  const proc = Bun.spawn({
    cmd: [ESBUILD_BIN, ...args],
    cwd: appDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`esbuild failed (exit ${proc.exitCode}):\n${stderr}`);
  }

  // Copy index.html with the platform's tag injection.
  const htmlSrc = join(srcDir, "index.html");
  if (existsSync(htmlSrc)) {
    let html = await readFile(htmlSrc, "utf-8");
    html = html.replace(
      /<script\b[^>]*\bsrc=["'][^"']*\.(?:tsx|ts|jsx)["'][^>]*>\s*<\/script>\s*/gi,
      "",
    );
    const distFiles = await readdir(distDir);
    const hasCss = distFiles.some((f) => f.endsWith(".css"));
    if (hasCss && !html.includes('href="main.css"')) {
      html = html.replace(
        "</head>",
        '  <link rel="stylesheet" href="main.css">\n  </head>',
      );
    }
    if (!html.includes('src="main.js"')) {
      html = html.replace(
        "</body>",
        '  <script type="module" src="main.js"></script>\n  </body>',
      );
    }
    await writeFile(join(distDir, "index.html"), html);
  }
}

// ── Build attestation ──────────────────────────────────────────────────────
//
// The host regenerates `apps/<app>/dist` itself and deliberately excludes it
// from install fingerprinting, so the artifact is not directly covered by
// the install hash. What the repo CAN pin is a source-plus-recipe
// attestation: hashes of every build input, the pinned esbuild version, and
// the hashes of the outputs a clean build produces. The attestation file is
// tracked source (covered by the install fingerprint), and the test suite
// rebuilds and compares — so a dist that drifts from reviewed source is
// detectable, even though only a host change could make the *installer*
// verify it (see README, platform limitations).

export interface BuildAttestation {
  esbuild: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
}

export async function computeAttestation(appDir: string, distDir: string): Promise<BuildAttestation> {
  const { createHash } = await import("node:crypto");
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { relative } = await import("node:path");

  const hashTree = (root: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir).sort()) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else {
          out[relative(root, full)] = createHash("sha256")
            .update(readFileSync(full))
            .digest("hex");
        }
      }
    };
    walk(root);
    return out;
  };

  const esbuildVersion = JSON.parse(
    await readFile(join(REPO_ROOT, "node_modules", "esbuild", "package.json"), "utf-8"),
  ).version as string;

  return {
    esbuild: esbuildVersion,
    inputs: hashTree(join(appDir, "src")),
    outputs: hashTree(distDir),
  };
}

export const ATTESTATION_PATH = join(REPO_ROOT, "build-attestation.json");

if (import.meta.main) {
  const appDir = join(REPO_ROOT, "apps", "taste");
  const distDir = join(appDir, "dist");
  await buildApp(appDir, distDir);
  const attestation = await computeAttestation(appDir, distDir);
  await writeFile(ATTESTATION_PATH, `${JSON.stringify(attestation, null, 2)}\n`);
  console.log("Built apps/taste/src → apps/taste/dist and wrote build-attestation.json");
}

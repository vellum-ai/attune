/**
 * The runtime artifact must be a pure function of reviewed source.
 *
 * The Vellum host generates `apps/taste/dist` itself (its app compiler runs
 * esbuild pinned at the version this repo pins), and excludes that dist from
 * install fingerprints — so the repo's guarantee is reproducibility: the same
 * source always yields byte-identical output. This test builds twice with the
 * platform's exact flags and compares; if a locally generated dist/ is
 * present (e.g. from an installed copy), it is compared against the fresh
 * build too.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildApp } from "../scripts/build-app";

const APP_DIR = join(import.meta.dir, "..", "apps", "taste");

function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string, prefix: string) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
      } else {
        out[rel] = createHash("sha256").update(readFileSync(full)).digest("hex");
      }
    }
  };
  walk(dir, "");
  return out;
}

describe("build reproducibility", () => {
  test("two clean builds produce byte-identical output", async () => {
    const a = mkdtempSync(join(tmpdir(), "taste-dist-a-"));
    const b = mkdtempSync(join(tmpdir(), "taste-dist-b-"));
    try {
      await buildApp(APP_DIR, a);
      await buildApp(APP_DIR, b);
      const hashesA = hashTree(a);
      const hashesB = hashTree(b);
      expect(Object.keys(hashesA).length).toBeGreaterThan(0);
      expect(hashesA).toEqual(hashesB);
      // The artifact contains the compiled entry and the injected html.
      expect(hashesA["main.js"]).toBeDefined();
      expect(hashesA["index.html"]).toBeDefined();
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  }, 30_000);

  test("an existing dist/ matches a fresh build of the reviewed source", async () => {
    const existing = join(APP_DIR, "dist");
    if (!existsSync(existing)) {
      // Fresh checkout: dist is host-generated and gitignored, nothing to
      // compare. The two-build determinism test above still holds.
      return;
    }
    const fresh = mkdtempSync(join(tmpdir(), "taste-dist-verify-"));
    try {
      await buildApp(APP_DIR, fresh);
      expect(hashTree(existing)).toEqual(hashTree(fresh));
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  }, 30_000);
});

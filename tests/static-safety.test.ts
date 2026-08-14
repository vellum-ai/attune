/**
 * Static sweep over the app's runtime source: the shipped bundle is compiled
 * from exactly these files, so proving the patterns absent here proves them
 * absent from the artifact (the reproducibility test ties the two together).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_DIR = join(import.meta.dir, "..", "apps", "taste", "src");

/**
 * Runtime source files: everything under apps/taste/src. Tests live outside
 * the app tree (the host's app compiler scans and bundles from src/, and
 * imports escaping the app directory would block its build), so the whole
 * subtree here is shipped code.
 */
function runtimeSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...runtimeSources(full));
    } else if (/\.(tsx?|jsx?|css|html)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  // Raw network / telemetry stays forbidden. The app may use only the
  // host-proxied bridge for its own namespaced profile route; that contract
  // is checked explicitly below.
  { label: "raw fetch call", pattern: /(?<!\.)\bfetch\s*\(/ },
  { label: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { label: "WebSocket", pattern: /\bWebSocket\b/ },
  { label: "EventSource", pattern: /EventSource/ },
  { label: "sendBeacon", pattern: /sendBeacon/ },
  { label: "WebRTC", pattern: /RTCPeerConnection/ },
  // Credential access
  { label: "cookie access", pattern: /document\.cookie/ },
  { label: "credential API", pattern: /navigator\.credentials/ },
  // Shell / process execution (impossible in the sandbox, but should never
  // even appear in source)
  { label: "child_process", pattern: /child_process/ },
  { label: "Bun spawn", pattern: /Bun\.(spawn|\$)/ },
  { label: "process access", pattern: /\bprocess\.(env|exec)/ },
  // Dynamic code execution
  { label: "eval", pattern: /\beval\s*\(/ },
  { label: "Function constructor", pattern: /new\s+Function\s*\(/ },
  { label: "dynamic import", pattern: /\bimport\s*\(/ },
  { label: "string setTimeout", pattern: /setTimeout\s*\(\s*["'`]/ },
  { label: "inline event handler HTML", pattern: /\bon\w+\s*=\s*"[^"]*\(/ },
];

describe("runtime source static safety", () => {
  const files = runtimeSources(SRC_DIR);

  test("scans a plausible set of files", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const { label, pattern } of FORBIDDEN) {
    test(`contains no ${label}`, () => {
      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        if (pattern.test(content)) {
          throw new Error(
            `${label} found in ${relative(SRC_DIR, file)} (pattern ${pattern})`,
          );
        }
      }
    });
  }

  test("the only host bridge actions are supported actions", () => {
    const vellum = readFileSync(join(SRC_DIR, "vellum.ts"), "utf-8");
    const actions = [...vellum.matchAll(/sendAction\?\.\(\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(new Set(actions).size).toBeGreaterThan(0);
    for (const action of actions) {
      expect(["relay_prompt", "set_view", "open_conversation"]).toContain(
        action,
      );
    }
  });

  test("the host fetch bridge is scoped to the plugin's own taste route", () => {
    const vellum = readFileSync(join(SRC_DIR, "vellum.ts"), "utf-8");
    // Every bridge-fetch base path is built from the fixed candidate list;
    // no other path literals reach hostFetch.
    expect(vellum).toContain('CANDIDATE_PLUGIN_DIRS = ["attune", "taste"]');
    expect(vellum).toContain("/v1/x/plugins/${dir}/taste");
    expect(vellum).not.toMatch(/\bwindow\.fetch\s*\(/);
    // No absolute-URL fetches anywhere in the app source.
    for (const file of files) {
      expect(readFileSync(file, "utf-8")).not.toMatch(/hostFetch\(\s*"https?:/);
    }
  });
});

describe("plugin-side source static safety (route + helpers)", () => {
  const PLUGIN_DIRS = [join(import.meta.dir, "..", "routes"), join(import.meta.dir, "..", "src")];
  const files = PLUGIN_DIRS.flatMap((dir) => runtimeSources(dir));

  // Route/helper code runs host-side: node:fs and @vellumai/plugin-api are
  // its sanctioned surface. Network, shell, and dynamic code stay forbidden.
  const FORBIDDEN_HOST_SIDE: Array<{ label: string; pattern: RegExp }> = [
    { label: "raw fetch call", pattern: /(?<!\.)\bfetch\s*\(/ },
    { label: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
    { label: "WebSocket", pattern: /\bWebSocket\b/ },
    { label: "child_process", pattern: /child_process/ },
    { label: "Bun spawn", pattern: /Bun\.(spawn|\$)/ },
    { label: "eval", pattern: /\beval\s*\(/ },
    { label: "Function constructor", pattern: /new\s+Function\s*\(/ },
    { label: "dynamic import", pattern: /\bimport\s*\(/ },
  ];

  test("scans the route and helper files", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  for (const { label, pattern } of FORBIDDEN_HOST_SIDE) {
    test(`route/helpers contain no ${label}`, () => {
      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        if (pattern.test(content)) {
          throw new Error(`${label} found in ${file} (pattern ${pattern})`);
        }
      }
    });
  }

  test("no hook, tool, or schedule surfaces exist — one skill, one app, one route", () => {
    const root = join(import.meta.dir, "..");
    for (const surface of ["hooks", "tools", "schedules"]) {
      let exists = true;
      try {
        readdirSync(join(root, surface));
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    }
    expect(readdirSync(join(root, "routes"))).toEqual(["taste.ts"]);
    expect(readdirSync(join(root, "skills"))).toEqual(["taste"]);
    expect(readdirSync(join(root, "apps"))).toEqual(["taste"]);
  });
});

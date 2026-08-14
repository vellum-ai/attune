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

  test("avatar witness stays decorative and has no orbit decoration", () => {
    const avatar = readFileSync(join(SRC_DIR, "components", "companion", "AvatarWitness.tsx"), "utf-8");
    const styles = readFileSync(join(SRC_DIR, "styles.css"), "utf-8");
    expect(avatar).toContain('aria-hidden="true"');
    expect(styles).toContain(".avatar-witness");
    expect(styles).toContain("pointer-events: none");
    expect(avatar).toContain("prefers-reduced-motion");
    expect(avatar).toContain("data-blinking");
    for (const removed of ["companion-wave", "wave-drift", "witness-wave", "choice-bloom", "question-step::before", "question-witness-bay::after", "dimension-card::after", "dimension-icon-line", "radial-gradient"]) {
      expect(styles).not.toContain(removed);
      expect(avatar).not.toContain(removed);
    }
  });

  test("summary uses short labels instead of classifier means", () => {
    const flow = readFileSync(join(SRC_DIR, "components", "Flow.tsx"), "utf-8");
    expect(flow).toContain("option.summary");
    expect(flow).not.toContain("sentenceCase(option.means)");
  });

  test("the host fetch bridge is scoped to the Taste profile route", () => {
    const vellum = readFileSync(join(SRC_DIR, "vellum.ts"), "utf-8");
    const routes = [...vellum.matchAll(/hostFetch\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(routes.length).toBeGreaterThan(0);
    expect(new Set(routes)).toEqual(new Set(["/x/plugins/taste/profile", "/x/plugins/taste/avatar"]));
    expect(vellum).not.toMatch(/\bwindow\.fetch\s*\(/);
  });
});

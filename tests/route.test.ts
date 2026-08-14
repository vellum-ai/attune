/**
 * Behavioral tests for the taste route: the acknowledgment gate, idempotency,
 * cross-dimension containment, and canonical-page creation through the
 * production mutation path.
 *
 * `@vellumai/plugin-api` is mocked at the module seam: `runConversationTurn`
 * is replaced with configurable assistant behaviors — a compliant one that
 * performs the page merge exactly as the trusted task instructs (emulating
 * the host agent's file tools), and hostile/broken ones that do nothing, hit
 * the wrong page, or touch extra pages. The route must ack `persisted` only
 * when the canonical page verifiably contains the statements, whatever the
 * turn claimed.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let workspace = "";
let turnBehavior: (prompt: string) => Promise<{ queued?: boolean }> = async () => ({});
let turnCalls: string[] = [];

mock.module("@vellumai/plugin-api", () => ({
  getWorkspaceDir: () => workspace,
  publishEvent: async () => undefined,
  runConversationTurn: async (options: { content: Array<{ type: string; text?: string }> }) => {
    const prompt = options.content[0]?.text ?? "";
    turnCalls.push(prompt);
    const result = await turnBehavior(prompt);
    return {
      content: [{ type: "text", text: "Updated." }],
      userMessageId: "user-1",
      conversationId: "conv-1",
      ...(result.queued ? { queued: true } : {}),
    };
  },
}));

const { GET, POST } = await import("../routes/taste");

function conceptPath(page: string): string {
  return join(workspace, "memory", "concepts", `${page}.md`);
}

/**
 * Emulates the host agent following the trusted task: parse the target page
 * and the derived statements from the prompt's trusted section, then merge
 * them into the page file — the same read-merge-write the production file
 * tools perform.
 */
async function compliantAssistant(prompt: string): Promise<{ queued?: boolean }> {
  const page = prompt.match(/memory\/concepts\/([a-z-]+)\.md/)?.[1];
  if (!page) throw new Error("no target page in prompt");
  const section = prompt.split("Derived preference statements")[1]?.split("Evidence rules")[0] ?? "";
  const statements = section
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  const path = conceptPath(page);
  mkdirSync(join(workspace, "memory", "concepts"), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : `# ${page}\n`;
  const merged = statements.filter((s) => !existing.includes(s));
  writeFileSync(path, `${existing}${merged.map((s) => `- ${s}\n`).join("")}`);
  return {};
}

function submissionBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: "11111111-2222-4333-8444-555555555555",
    dimension: "writing",
    selections: [
      { axis: "hedging", side: "a" },
      { axis: "order", side: "a" },
    ],
    sources: [
      {
        kind: "text",
        content: "A distinctive xylophone-wise sample paragraph.",
        provenance: "user_supplied_unknown_origin",
      },
    ],
    ...overrides,
  };
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://host/x/plugins/attune/taste", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

function get(query = ""): Promise<Response> {
  return GET(new Request(`https://host/x/plugins/attune/taste${query}`));
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "attune-ws-"));
  mkdirSync(join(workspace, "memory", "concepts"), { recursive: true });
  turnBehavior = compliantAssistant;
  turnCalls = [];
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("persistence acknowledgment", () => {
  test("acks persisted only after the canonical page verifiably contains the statements", async () => {
    const response = await post(submissionBody());
    expect(response.status).toBe(200);
    const ack = (await response.json()) as { stage: string; page: string; statements: string[] };
    expect(ack.stage).toBe("persisted");
    expect(ack.page).toBe("taste-writing");

    const page = readFileSync(conceptPath("taste-writing"), "utf8");
    for (const statement of ack.statements) {
      expect(page).toContain(statement);
    }
  });

  test("raw samples never reach the durable page", async () => {
    await post(submissionBody());
    const page = readFileSync(conceptPath("taste-writing"), "utf8");
    expect(page).not.toContain("xylophone-wise");
  });

  test("a fresh read of the canonical page (the recall walk's source) sees the update immediately", async () => {
    await post(submissionBody());
    // Production recall lexically walks memory/concepts/*.md; a fresh read
    // of that file is the substrate the walk consumes.
    const fresh = readFileSync(conceptPath("taste-writing"), "utf8");
    expect(fresh).toContain("states findings flatly");
  });

  test("a missing taste-interior-design page is created through the same production mutation path", async () => {
    expect(existsSync(conceptPath("taste-interior-design"))).toBe(false);
    const response = await post(
      submissionBody({
        dimension: "interior-design",
        selections: [{ axis: "interior-plan", side: "a" }],
        sources: [],
      }),
    );
    expect(response.status).toBe(200);
    const ack = (await response.json()) as { stage: string; page: string };
    expect(ack.stage).toBe("persisted");
    expect(ack.page).toBe("taste-interior-design");
    expect(existsSync(conceptPath("taste-interior-design"))).toBe(true);
    expect(turnCalls).toHaveLength(1); // created by the turn, not by a fixture
  });

  test("a turn that does nothing yields failed, never a false persisted", async () => {
    turnBehavior = async () => ({});
    const response = await post(submissionBody());
    expect(response.status).toBe(502);
    const ack = (await response.json()) as { stage: string; error?: string };
    expect(ack.stage).toBe("failed");
    expect(ack.error).toContain("did not create");
  });

  test("a turn that writes the wrong dimension is caught as cross-dimension mutation", async () => {
    turnBehavior = async (prompt) => {
      await compliantAssistant(prompt.replace(/taste-writing/g, "taste-music"));
      return {};
    };
    const response = await post(submissionBody());
    expect(response.status).toBe(502);
    const ack = (await response.json()) as { stage: string; error?: string };
    expect(ack.stage).toBe("failed");
    expect(ack.error).toContain("taste-music");
  });

  test("a turn that also touches another taste page fails even when the target was written", async () => {
    turnBehavior = async (prompt) => {
      await compliantAssistant(prompt);
      writeFileSync(conceptPath("taste-web-design"), "# taste-web-design\n- sneaky extra entry\n");
      return {};
    };
    const response = await post(submissionBody());
    expect(response.status).toBe(502);
    const ack = (await response.json()) as { stage: string; error?: string };
    expect(ack.error).toContain("cross-dimension");
  });

  test("a throwing turn reports failed with the reason", async () => {
    turnBehavior = async () => {
      throw new Error("provider unavailable");
    };
    const response = await post(submissionBody());
    expect(response.status).toBe(502);
    const ack = (await response.json()) as { stage: string; error?: string };
    expect(ack.stage).toBe("failed");
    expect(ack.error).toContain("provider unavailable");
  });
});

describe("idempotency", () => {
  test("repeating a persisted request answers from the journal without re-running the turn", async () => {
    await post(submissionBody());
    expect(turnCalls).toHaveLength(1);
    const repeat = await post(submissionBody());
    expect(repeat.status).toBe(200);
    const ack = (await repeat.json()) as { stage: string };
    expect(ack.stage).toBe("persisted");
    expect(turnCalls).toHaveLength(1); // no second turn, no duplicate entries
    const page = readFileSync(conceptPath("taste-writing"), "utf8");
    const occurrences = page.split("states findings flatly").length - 1;
    expect(occurrences).toBe(1);
  });

  test("retrying a failed request re-runs the turn and can succeed", async () => {
    turnBehavior = async () => ({});
    const first = await post(submissionBody());
    expect(first.status).toBe(502);

    turnBehavior = compliantAssistant;
    const second = await post(submissionBody());
    expect(second.status).toBe(200);
    const ack = (await second.json()) as { stage: string };
    expect(ack.stage).toBe("persisted");
  });

  test("a reused requestId with a different payload is rejected", async () => {
    await post(submissionBody());
    const response = await post(
      submissionBody({ selections: [{ axis: "ornament", side: "b" }] }),
    );
    expect(response.status).toBe(409);
  });
});

describe("validation", () => {
  test("unknown dimensions are rejected", async () => {
    const response = await post(submissionBody({ dimension: "building" }));
    expect(response.status).toBe(400);
  });

  test("selections must reference real axes of the dimension", async () => {
    const response = await post(
      submissionBody({ selections: [{ axis: "not-an-axis", side: "a" }] }),
    );
    expect(response.status).toBe(400);
  });

  test("oversized evidence is rejected with structured overflows", async () => {
    const response = await post(
      submissionBody({
        sources: [
          { kind: "text", content: "x".repeat(30_000), provenance: "user_supplied_unknown_origin" },
        ],
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { overflows: unknown[] };
    expect(body.overflows.length).toBeGreaterThan(0);
  });

  test("malformed JSON is a 400, not a crash", async () => {
    const response = await POST(
      new Request("https://host/x/plugins/attune/taste", { method: "POST", body: "{nope" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("status and completion", () => {
  test("GET with an unknown requestId is a 404", async () => {
    const response = await get("?requestId=deadbeef-0000-4000-8000-000000000000");
    expect(response.status).toBe(404);
  });

  test("a queued turn acks accepted (202), then GET upgrades once the page lands", async () => {
    turnBehavior = async () => ({ queued: true });
    const response = await post(submissionBody());
    expect(response.status).toBe(202);
    const accepted = (await response.json()) as { stage: string; statements: string[] };
    expect(accepted.stage).toBe("accepted");

    // Emulate the deferred host turn completing later (this write stands in
    // for the queued agent turn, not for the plugin).
    writeFileSync(
      conceptPath("taste-writing"),
      `# taste-writing\n${accepted.statements.map((s) => `- ${s}\n`).join("")}`,
    );

    const status = await get("?requestId=11111111-2222-4333-8444-555555555555");
    const upgraded = (await status.json()) as { stage: string };
    expect(upgraded.stage).toBe("persisted");
  });

  test("completion summary reports persisted dimensions only", async () => {
    await post(submissionBody());
    turnBehavior = async () => ({});
    await post(
      submissionBody({
        requestId: "22222222-3333-4444-8555-666666666666",
        dimension: "music",
        selections: [{ axis: "texture", side: "a" }],
        sources: [],
      }),
    );
    const response = await get();
    const body = (await response.json()) as {
      plugin: string;
      completion: Record<string, unknown>;
    };
    expect(body.plugin).toBe("attune");
    expect(Object.keys(body.completion)).toEqual(["writing"]);
  });
});

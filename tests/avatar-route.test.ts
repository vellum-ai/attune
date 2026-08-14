import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GET } from "../routes/avatar";

const ROOT = join(import.meta.dir, `.avatar-route-${process.pid}`);
const ORIGINAL = process.env.VELLUM_WORKSPACE_DIR;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const TRAITS = { bodyShape: "urchin", eyeStyle: "goofy", color: "teal" };

async function avatarDir() {
  const dir = join(ROOT, "data", "avatar");
  await mkdir(dir, { recursive: true });
  return dir;
}

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
  if (ORIGINAL === undefined) delete process.env.VELLUM_WORKSPACE_DIR;
  else process.env.VELLUM_WORKSPACE_DIR = ORIGINAL;
});

describe("fixed Taste avatar route", () => {
  test("returns validated character traits and a data URL from fixed files", async () => {
    process.env.VELLUM_WORKSPACE_DIR = ROOT;
    const dir = await avatarDir();
    await writeFile(join(dir, "avatar.json"), JSON.stringify({ kind: "character", traits: TRAITS }));
    await writeFile(join(dir, "character-traits.json"), JSON.stringify(TRAITS));
    await writeFile(join(dir, "avatar-image.png"), PNG);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ kind: "character", traits: TRAITS, image: `data:image/png;base64,${PNG.toString("base64")}` });
  });

  test("returns image-only state when metadata is absent or invalid", async () => {
    process.env.VELLUM_WORKSPACE_DIR = ROOT;
    const dir = await avatarDir();
    await writeFile(join(dir, "character-traits.json"), JSON.stringify({ bodyShape: "blob", eyeStyle: "goofy", color: "teal" }));
    await writeFile(join(dir, "avatar-image.png"), PNG);

    expect(await (await GET()).json()).toEqual({ kind: "image", traits: null, image: `data:image/png;base64,${PNG.toString("base64")}` });
  });

  test("returns none for missing or non-PNG avatar data", async () => {
    process.env.VELLUM_WORKSPACE_DIR = ROOT;
    const dir = await avatarDir();
    await writeFile(join(dir, "avatar-image.png"), "not an image");

    expect(await (await GET()).json()).toEqual({ kind: "none", traits: null, image: null });
  });

  test("rejects oversized PNG files", async () => {
    process.env.VELLUM_WORKSPACE_DIR = ROOT;
    const dir = await avatarDir();
    await writeFile(join(dir, "avatar-image.png"), Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));

    expect(await (await GET()).json()).toEqual({ kind: "none", traits: null, image: null });
  });

  test("ignores query parameters and never reads caller-selected paths", async () => {
    process.env.VELLUM_WORKSPACE_DIR = ROOT;
    await avatarDir();
    const response = await GET();
    expect(await response.json()).toEqual({ kind: "none", traits: null, image: null });
  });
});

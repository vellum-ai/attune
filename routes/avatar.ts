import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, max-age=60, stale-while-revalidate=300",
  "x-content-type-options": "nosniff",
};

export type AvatarTraits = {
  bodyShape: "urchin";
  eyeStyle: "goofy";
  color: "teal";
};

const BODY_SHAPES = new Set(["urchin"]);
const EYE_STYLES = new Set(["goofy"]);
const COLORS = new Set(["teal"]);

function json(value: unknown): Response {
  return Response.json(value, { headers: JSON_HEADERS });
}

function avatarDir(): string {
  const workspace = process.env.VELLUM_WORKSPACE_DIR;
  return workspace ? join(workspace, "data", "avatar") : "";
}

function validTraits(value: unknown): value is AvatarTraits {
  if (!value || typeof value !== "object") return false;
  const traits = value as Record<string, unknown>;
  return typeof traits.bodyShape === "string" && BODY_SHAPES.has(traits.bodyShape)
    && typeof traits.eyeStyle === "string" && EYE_STYLES.has(traits.eyeStyle)
    && typeof traits.color === "string" && COLORS.has(traits.color);
}

function readTraits(dir: string): AvatarTraits | null {
  for (const filename of ["avatar.json", "character-traits.json"]) {
    const path = join(dir, filename);
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { traits?: unknown };
      const candidate = parsed && typeof parsed === "object" && "traits" in parsed ? parsed.traits : parsed;
      if (validTraits(candidate)) return candidate;
    } catch {
      // Fixed metadata files are optional; malformed metadata is ignored safely.
    }
  }
  return null;
}

function readImage(dir: string): string | null {
  const path = join(dir, "avatar-image.png");
  try {
    if (!existsSync(path) || statSync(path).size > MAX_AVATAR_BYTES) return null;
    const buffer = readFileSync(path);
    if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Parameterless, fixed-path, read-only avatar adapter. */
export async function GET(): Promise<Response> {
  const dir = avatarDir();
  if (!dir) return json({ kind: "none", traits: null, image: null });

  const traits = readTraits(dir);
  const image = readImage(dir);
  return json({
    kind: traits ? "character" : image ? "image" : "none",
    traits,
    image,
  });
}

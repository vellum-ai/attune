import { publishEvent } from "@vellumai/plugin-api";
import {
  PROFILE_SYNC_TAG,
  readProfile,
  setBaseline,
  setOverride,
} from "../skills/taste/tools/update_profile";

export const description = "Read and calibrate the structured Taste profile.";

async function publishProfileChanged(): Promise<void> {
  await publishEvent({
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    message: { type: "sync_changed", tags: [PROFILE_SYNC_TAG] } as never,
  });
}

function publicProfile(profile: Awaited<ReturnType<typeof readProfile>>) {
  const { _evidence, ...visible } = profile;
  return visible;
}

export async function GET(): Promise<Response> {
  return Response.json(publicProfile(await readProfile()));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "request body must be an object" }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    const action = input.action;
    let profile;
    if (action === "set_baseline") {
      profile = await setBaseline(input.dimensionId ?? input.dimension_id, input.answers);
    } else if (action === "set_override") {
      profile = await setOverride(
        input.dimensionId ?? input.dimension_id,
        input.axisId ?? input.axis_id,
        input.position ?? input.overridePosition ?? input.override_position ?? null,
      );
    } else {
      return Response.json({ error: "action must be set_baseline or set_override" }, { status: 400 });
    }
    await publishProfileChanged().catch(() => undefined);
    return Response.json(publicProfile(profile));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

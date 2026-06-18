import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { getSceneText } from "@/lib/prompt-builder";
import { buildNarrationText, synthesizeNarration } from "@/lib/narration";

/**
 * GET /api/scene/[id]/narrate
 *
 * Generates a spoken narration snippet for a single scene and returns the
 * content-addressed audio file produced by Cartesia TTS.
 *
 * **Pipeline**
 * 1. Parses `id` from the route segment and coerces it to an integer `sceneId`.
 *    Returns 400 if the value is not a valid integer.
 * 2. Calls {@link loadBible} and {@link loadBook} (both read from the in-process
 *    module-level cache populated by the ingest script).
 * 3. Looks up the matching {@link Scene} in `bible.scenes`; returns 404 if absent.
 * 4. Extracts the raw book text for that scene via {@link getSceneText}, which
 *    slices the book string using the scene's `startChar`/`endChar` offsets.
 * 5. Calls {@link buildNarrationText} to ask Claude for 2-3 sentences of
 *    "warm literary companion" spoken context (220-token budget).
 * 6. Passes the narration text to {@link synthesizeNarration}, which sends it to
 *    Cartesia and writes the MP3 to `public/audio/<sha256>.mp3`; subsequent calls
 *    with identical text skip the API call and return `cached: true`.
 *
 * @param _req - Incoming Next.js request (unused; no query params required).
 * @param ctx  - Route context providing `params.id` — the scene id string from
 *               the URL segment (e.g. `"3"` for `/api/scene/3/narrate`).
 *
 * @returns JSON response in one of these shapes:
 *   - **200** `{ sceneId: number, text: string, audioUrl: string, cached: boolean }`
 *     — narration generated (or served from cache); `audioUrl` is a root-relative
 *     path to the MP3 under `public/audio/`.
 *   - **400** `{ error: "invalid scene id" }` — `id` param is not a valid integer.
 *   - **404** `{ error: "scene not found" }` — no scene with that id in the bible.
 *   - **500** `{ error: string }` — unexpected error; message forwarded from the
 *     thrown `Error`.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/scene/[id]/narrate">,
) {
  try {
    const { id } = await ctx.params;
    const sceneId = Number(id);
    if (!Number.isInteger(sceneId)) {
      return Response.json({ error: "invalid scene id" }, { status: 400 });
    }

    const bible = loadBible();
    const book = loadBook();
    const scene = bible.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return Response.json({ error: "scene not found" }, { status: 404 });
    }

    const sceneText = getSceneText(bible, scene, book);
    const text = await buildNarrationText({ bible, scene, sceneText });
    const audio = await synthesizeNarration(text);

    return Response.json({
      sceneId,
      text,
      audioUrl: audio.audioUrl,
      cached: audio.cached,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

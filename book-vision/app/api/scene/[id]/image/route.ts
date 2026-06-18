import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { buildImagePrompt, getSceneText } from "@/lib/prompt-builder";
import { generateImage } from "@/lib/image-gen";

/**
 * GET /api/scene/[id]/image
 *
 * Generates (or returns a cached) illustration for a single scene.
 *
 * Pipeline:
 * 1. Parse and validate `id` from the dynamic route segment — must be an integer.
 * 2. Load the in-memory {@link StoryBible} and raw book text via {@link loadBible}
 *    / {@link loadBook}.
 * 3. Look up the {@link Scene} whose `id` matches; 404 if absent.
 * 4. Reconstruct the scene's source text with {@link getSceneText}.
 * 5. Build a Gemini image-generation prompt via {@link buildImagePrompt}.
 * 6. Call {@link generateImage}, which checks a content-addressed on-disk cache
 *    (keyed on the prompt) before hitting the Gemini API. The `cached` flag in
 *    the response reflects whether the image was served from cache.
 *
 * @param _req - Incoming Next.js request (unused; no query params are consumed).
 * @param ctx  - Route context supplying the `[id]` path parameter.
 *
 * @returns JSON response:
 *   - **200** `{ sceneId: number, prompt: string, url: string, cached: boolean }`
 *     where `url` is a `/public/images/…` path served as a static asset.
 *   - **400** `{ error: "invalid scene id" }` — `id` is not an integer.
 *   - **404** `{ error: "scene not found" }` — no scene with that id in the bible.
 *   - **500** `{ error: string }` — unexpected error from prompt-build or image-gen.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/scene/[id]/image">,
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
    const prompt = await buildImagePrompt({ bible, scene, sceneText });
    const image = await generateImage(prompt);

    return Response.json({
      sceneId,
      prompt,
      url: image.url,
      cached: image.cached,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

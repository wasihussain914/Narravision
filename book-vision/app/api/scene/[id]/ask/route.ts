import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { answerQuestion } from "@/lib/qa-context";
import { synthesizeNarration } from "@/lib/narration";

/**
 * POST /api/scene/[id]/ask
 *
 * Answers a reader question about a specific scene while keeping the reply
 * spoiler-free relative to the scene's position in the book.
 *
 * @param req - Next.js request; body must be JSON with a `question` string field.
 * @param ctx - Route context; `params.id` is the numeric scene identifier.
 *
 * **Request body**
 * ```json
 * { "question": "Why did the captain hesitate?" }
 * ```
 *
 * **Pipeline**
 * 1. Parse and validate `sceneId` from the URL segment.
 * 2. Validate that `body.question` is a non-empty string.
 * 3. Load the {@link StoryBible} and raw book text via {@link loadBible} /
 *    {@link loadBook} (in-memory cache after first call).
 * 4. Locate the target scene; 404 if not found.
 * 5. Generate a spoiler-free answer via {@link answerQuestion} (Claude with
 *    prompt-caching; only text up to and including this scene is visible).
 * 6. Best-effort TTS: pass the answer to {@link synthesizeNarration}; if
 *    Cartesia synthesis fails the request still succeeds with `audioUrl: null`.
 *
 * **Response shapes**
 * | Status | Body |
 * |--------|------|
 * | 200 | `{ sceneId, question, answer, audioUrl: string \| null }` |
 * | 400 | `{ error: "invalid scene id" }` — non-integer `id` segment |
 * | 400 | `{ error: "question is required" }` — missing or non-string body field |
 * | 404 | `{ error: "scene not found" }` — `sceneId` not in the StoryBible |
 * | 500 | `{ error: "<message>" }` — unexpected server error |
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/scene/[id]/ask">,
) {
  try {
    const { id } = await ctx.params;
    const sceneId = Number(id);
    if (!Number.isInteger(sceneId)) {
      return Response.json({ error: "invalid scene id" }, { status: 400 });
    }

    const body = await req.json();
    const question = body.question;
    if (!question || typeof question !== "string") {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    const bible = loadBible();
    const bookText = loadBook();
    const scene = bible.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return Response.json({ error: "scene not found" }, { status: 404 });
    }

    const answer = await answerQuestion({
      bible,
      scene,
      bookText,
      question,
    });

    let audioUrl: string | null = null;
    try {
      const audio = await synthesizeNarration(answer);
      audioUrl = audio.audioUrl;
    } catch (err) {
      console.error("TTS synthesis failed:", err);
    }

    return Response.json({
      sceneId,
      question,
      answer,
      audioUrl,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

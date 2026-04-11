import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { getSceneText } from "@/lib/prompt-builder";
import { buildNarrationText, synthesizeNarration } from "@/lib/narration";

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

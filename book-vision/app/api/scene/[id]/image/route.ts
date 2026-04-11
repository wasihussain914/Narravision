import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { buildImagePrompt, getSceneText } from "@/lib/prompt-builder";
import { generateImage } from "@/lib/image-gen";

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

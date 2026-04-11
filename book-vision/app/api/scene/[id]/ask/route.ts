import type { NextRequest } from "next/server";
import { loadBible, loadBook } from "@/lib/store";
import { answerQuestion } from "@/lib/qa-context";
import { synthesizeNarration } from "@/lib/narration";

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

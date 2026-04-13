import { getGemini, GEMINI_TEXT_MODEL } from "./gemini";
import type { Character, Location, Scene, StoryBible } from "./types";

const PROMPT_SYSTEM = `You write single-paragraph illustration prompts for an image model.

You will receive:
- The overall art direction for a book
- The canonical visual descriptions of characters and locations present in the current scene
- The raw text of the current scene

Rules:
- Output ONE paragraph, 60-120 words. No lists, no headings, no quotes.
- Lead with the focal action, then subject appearance, then setting, then lighting/mood, then style.
- Reuse the provided visual descriptions VERBATIM for characters and locations. This keeps continuity across images.
- Do NOT invent details that contradict the descriptions.
- Do NOT reference plot points that happen after the scene text provided.
- End with the art direction style phrase.`;

export interface PromptBuilderInput {
  bible: StoryBible;
  scene: Scene;
  sceneText: string;
}

function filterEntities<T extends { name: string; first_appears_at: number }>(
  all: T[],
  presentNames: string[],
  sceneStart: number,
): T[] {
  const nameSet = new Set(presentNames);
  return all.filter(
    (e) => nameSet.has(e.name) && e.first_appears_at <= sceneStart,
  );
}

export async function buildImagePrompt({
  bible,
  scene,
  sceneText,
}: PromptBuilderInput): Promise<string> {
  const characters: Character[] = filterEntities(
    bible.characters,
    scene.present_characters,
    scene.start_char,
  );
  const locations: Location[] = filterEntities(
    bible.locations,
    scene.present_locations,
    scene.start_char,
  );

  const contextBlock = [
    `ART DIRECTION:`,
    `  style: ${bible.art_direction.style}`,
    `  palette: ${bible.art_direction.palette}`,
    `  mood: ${bible.art_direction.mood}`,
    ``,
    `CHARACTERS IN SCENE:`,
    ...(characters.length
      ? characters.map((c) => `- ${c.name}: ${c.visual_description}`)
      : ["(none)"]),
    ``,
    `LOCATIONS IN SCENE:`,
    ...(locations.length
      ? locations.map((l) => `- ${l.name}: ${l.visual_description}`)
      : ["(none)"]),
    ``,
    `SCENE TEXT:`,
    sceneText,
  ].join("\n");

  const prompt = `${PROMPT_SYSTEM}

${contextBlock}`;

  const response = await getGemini().models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 400,
      temperature: 0.7,
    },
  });

  const textPart = response.candidates?.[0]?.content?.parts?.find((p) => p.text);
  if (!textPart || !textPart.text) {
    throw new Error("Gemini returned no prompt text");
  }
  return textPart.text.trim();
}

export function getSceneText(bible: StoryBible, scene: Scene, bookText: string): string {
  return bookText.slice(scene.start_char, scene.end_char);
}

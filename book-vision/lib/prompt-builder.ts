import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
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

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 400,
    system: PROMPT_SYSTEM,
    messages: [
      {
        role: "user",
        content: contextBlock,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no prompt text");
  }
  return textBlock.text.trim();
}

export function getSceneText(bible: StoryBible, scene: Scene, bookText: string): string {
  return bookText.slice(scene.start_char, scene.end_char);
}

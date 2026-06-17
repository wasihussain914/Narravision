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

/**
 * Input bundle for {@link buildImagePrompt}.
 *
 * @property bible      - The full {@link StoryBible} produced by `buildStoryBible()`,
 *                        containing art direction, all characters, all locations, and scenes.
 * @property scene      - The specific {@link Scene} to illustrate (carries char offsets and
 *                        the lists of entity names present in this scene).
 * @property sceneText  - Raw book text for this scene, typically obtained via
 *                        {@link getSceneText}. Passed separately so callers can inject
 *                        pre-sliced text without re-reading the book file.
 */
export interface PromptBuilderInput {
  bible: StoryBible;
  scene: Scene;
  sceneText: string;
}

/**
 * Narrows a full entity list to those that are (a) named in `presentNames` for this scene
 * and (b) have already appeared in the story by `sceneStart` (char offset).
 *
 * The `first_appears_at` guard prevents characters or locations from being mentioned
 * in an illustration before they are canonically introduced to the reader.
 *
 * @param all           - Complete array of entities (characters OR locations) from the bible.
 * @param presentNames  - Entity names flagged by the bible as present in the current scene.
 * @param sceneStart    - Character offset of the scene's first character in the raw book text.
 * @returns Filtered subset of `all` that should appear in the image prompt.
 */
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

/**
 * Calls Claude to synthesise a single-paragraph image-generation prompt for a scene.
 *
 * The assembled context block feeds the model:
 * - `ART DIRECTION` — style, palette, and mood from the story bible.
 * - `CHARACTERS IN SCENE` — canonical visual descriptions verbatim (keeps visual
 *   continuity across all generated images).
 * - `LOCATIONS IN SCENE` — same approach as characters.
 * - `SCENE TEXT` — the raw passage the illustration must depict.
 *
 * Entity lists are narrowed by {@link filterEntities} so only characters/locations
 * already introduced to the reader appear in the prompt.
 *
 * @param input - {@link PromptBuilderInput} containing the bible, scene, and scene text.
 * @returns A 60–120-word illustration prompt string, trimmed of leading/trailing whitespace.
 * @throws {Error} If Claude returns a response with no text content block.
 *
 * @example
 * ```ts
 * const prompt = await buildImagePrompt({ bible, scene, sceneText });
 * // "Harry stands at the foot of the grand staircase, robe billowing..."
 * ```
 */
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

/**
 * Extracts the raw text for a scene by slicing the full book string using the
 * char-offset pair stored in the {@link Scene} object.
 *
 * The offsets (`start_char` / `end_char`) are character indices into the original
 * book text as ingested by `scripts/ingest.ts`. They are stored in the story bible
 * so that the same slice can be reproduced cheaply at runtime without re-parsing.
 *
 * @param bible    - Not read directly; kept in the signature for future extensibility
 *                   (e.g. injecting chapter metadata alongside the excerpt).
 * @param scene    - Scene whose `start_char` and `end_char` define the slice bounds.
 * @param bookText - Full raw book string (typically from {@link loadBook}).
 * @returns The substring of `bookText` that corresponds to this scene.
 */
export function getSceneText(bible: StoryBible, scene: Scene, bookText: string): string {
  return bookText.slice(scene.start_char, scene.end_char);
}

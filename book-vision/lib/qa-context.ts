import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { Character, Location, Scene, StoryBible } from "./types";

const QA_SYSTEM_PROMPT = `You are a helpful literary companion assisting a reader as they progress through a book.

CRITICAL SPOILER-PREVENTION RULES:
- You can ONLY discuss events, characters, and locations that have appeared up to the current scene
- NEVER reveal, hint at, or foreshadow anything that happens after the provided context
- If asked about future events or characters not yet introduced, politely say: "I can only discuss what's happened up to your current reading position to avoid spoilers!"
- If unsure whether something is a spoiler, err on the side of caution and don't reveal it

Your role:
- Answer questions about current and past scenes
- Explain character motivations based on what's been revealed so far
- Clarify plot points, relationships, and symbolism within the known context
- Provide analysis and insights without spoiling future developments

Be conversational, insightful, and helpful while maintaining strict spoiler-free boundaries.`;

/**
 * Input parameters for the Q&A ask endpoint.
 *
 * All fields must be scoped to the reader's current position so the spoiler
 * filter can do its job correctly.
 */
interface QAInput {
  /** The full parsed story bible (characters, scenes, locations, art direction). */
  bible: StoryBible;
  /** The scene the reader is currently viewing — sets the spoiler cutoff. */
  scene: Scene;
  /** Raw book text as a single string; sliced by `scene.start_char`/`end_char`. */
  bookText: string;
  /** The reader's free-text question about the story. */
  question: string;
}

/**
 * Returns only the entities (characters or locations) whose `first_appears_at`
 * character offset falls at or before `sceneEndChar`, guaranteeing that nothing
 * introduced after the reader's current position leaks into the Q&A context.
 */
function filterEntities<T extends { name: string; first_appears_at: number }>(
  all: T[],
  sceneEndChar: number,
): T[] {
  return all.filter((e) => e.first_appears_at <= sceneEndChar);
}

/**
 * Assembles the spoiler-free context block that is passed to Claude as a
 * cached system prompt alongside `QA_SYSTEM_PROMPT`.
 *
 * The block includes: book title, art direction, characters/locations whose
 * `first_appears_at` ≤ `scene.end_char`, a progress indicator, summaries of
 * all scenes up to and including `scene.id`, and the raw scene text slice.
 * Because the block is sent with `cache_control: { type: "ephemeral" }`, it is
 * cached for the duration of a reading session, so repeated questions about
 * the same scene do not re-tokenise the full context.
 *
 * @param bible  - Parsed story bible from `lib/store.ts`.
 * @param scene  - The scene currently displayed to the reader (sets spoiler cutoff).
 * @param bookText - Full raw book text; sliced to `[scene.start_char, scene.end_char]`.
 * @returns A multi-line string ready to be embedded in the system prompt array.
 */
function buildSpoilerFreeContext(bible: StoryBible, scene: Scene, bookText: string): string {
  // Only include scenes up to and including the current one
  const knownScenes = bible.scenes.filter((s) => s.id <= scene.id);

  // Only include characters and locations that have appeared by the end of current scene
  const knownCharacters: Character[] = filterEntities(
    bible.characters,
    scene.end_char,
  );
  const knownLocations: Location[] = filterEntities(
    bible.locations,
    scene.end_char,
  );

  // Build context block
  const contextParts = [
    `BOOK TITLE: ${bible.title}`,
    ``,
    `ART DIRECTION:`,
    `  Style: ${bible.art_direction.style}`,
    `  Palette: ${bible.art_direction.palette}`,
    `  Mood: ${bible.art_direction.mood}`,
    ``,
    `CHARACTERS KNOWN SO FAR (${knownCharacters.length}):`,
    ...(knownCharacters.length
      ? knownCharacters.map((c) => `- ${c.name}: ${c.visual_description}`)
      : ["(none yet)"]),
    ``,
    `LOCATIONS KNOWN SO FAR (${knownLocations.length}):`,
    ...(knownLocations.length
      ? knownLocations.map((l) => `- ${l.name}: ${l.visual_description}`)
      : ["(none yet)"]),
    ``,
    `STORY PROGRESS: Scene ${scene.id} of ${bible.scenes.length} (${Math.round((scene.end_char / bible.book_length) * 100)}% through book)`,
    ``,
    `SCENES READ SO FAR:`,
    ...knownScenes.map((s) => `Scene ${s.id}: ${s.summary}`),
    ``,
    `CURRENT SCENE TEXT:`,
    bookText.slice(scene.start_char, scene.end_char),
  ];

  return contextParts.join("\n");
}

/**
 * Answers a reader's question about the story, strictly confined to events and
 * characters introduced up to the current scene (no spoilers).
 *
 * Flow:
 * 1. Calls `buildSpoilerFreeContext` to assemble a cached system-prompt block.
 * 2. Sends a two-part system prompt to Claude: the static instruction text
 *    (`QA_SYSTEM_PROMPT`) followed by the dynamic context block marked
 *    `cache_control: ephemeral` — so repeated questions within the same session
 *    skip re-tokenising the entire scene/character context.
 * 3. Returns the first text block from Claude's response, trimmed.
 *
 * @param params - {@link QAInput} with bible, scene, bookText, and question.
 * @returns Claude's answer as a plain string.
 * @throws {Error} If Claude returns a response with no text content block.
 */
export async function answerQuestion({
  bible,
  scene,
  bookText,
  question,
}: QAInput): Promise<string> {
  const context = buildSpoilerFreeContext(bible, scene, bookText);

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1000,
    system: [
      {
        type: "text",
        text: QA_SYSTEM_PROMPT,
      },
      {
        type: "text",
        text: context,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: question,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text response");
  }

  return textBlock.text.trim();
}

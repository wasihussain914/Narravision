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

interface QAInput {
  bible: StoryBible;
  scene: Scene;
  bookText: string;
  question: string;
}

function filterEntities<T extends { name: string; first_appears_at: number }>(
  all: T[],
  sceneEndChar: number,
): T[] {
  return all.filter((e) => e.first_appears_at <= sceneEndChar);
}

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

import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { StoryBible } from "./types";

const SYSTEM_PROMPT = `You are a literary analyst building a "Story Bible" for an illustrated reading experience.

Given the full text of a book, output a single JSON object describing the cast, settings, art direction, and a scene index. The JSON will be used to generate illustrations as a reader scrolls through the book.

Hard requirements:
- Return ONLY valid JSON. No prose, no markdown fences.
- Scenes should be semantic units (location/time/POV shifts), not paragraphs or chapters. Aim for 15-40 scenes for a typical novel.
- start_char and end_char are zero-indexed character offsets into the raw book text.
- present_characters and present_locations list names that MUST also exist in the top-level characters/locations arrays.
- first_appears_at is the start_char of the scene where the entity first shows up.
- visual_description should be 1-2 sentences focused on what an illustrator would need: appearance, clothing, posture, age, distinguishing features. NO plot.
- art_direction.style should be inferred from the prose (e.g. "muted sci-fi gouache", "ink and watercolor", "noir charcoal").

Schema:
{
  "title": string,
  "art_direction": { "style": string, "palette": string, "mood": string },
  "characters": [{ "name": string, "visual_description": string, "first_appears_at": number }],
  "locations":  [{ "name": string, "visual_description": string, "first_appears_at": number }],
  "scenes": [{
    "id": number,
    "start_char": number,
    "end_char": number,
    "summary": string,
    "present_characters": string[],
    "present_locations": string[]
  }]
}`;

/**
 * Analyzes a book's full text with Claude and returns a structured Story Bible.
 *
 * Sends the entire `bookText` to Claude in a single call (with prompt caching on
 * the book content block) and asks it to extract cast, settings, art direction,
 * and a scene index with zero-indexed character offsets.  The model is instructed
 * to return raw JSON only; this function strips any accidental markdown fences and
 * parses the result before returning it.
 *
 * @param bookText - Raw full text of the book (no length limit enforced here;
 *   `max_tokens` is set to 16 000 on the response side).
 * @param title - Book title forwarded to the model to anchor its analysis.
 * @returns A {@link StoryBible} describing characters, locations, scenes
 *   (with `start_char`/`end_char` offsets), art direction, and `book_length`
 *   (character count of the original text).
 * @throws {Error} If Claude returns no text block or if the JSON cannot be parsed.
 */
export async function buildStoryBible(bookText: string, title: string): Promise<StoryBible> {
  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
      },
      {
        type: "text",
        text: `BOOK TITLE: ${title}\n\nBOOK TEXT:\n${bookText}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content:
          "Analyze the book above and return the Story Bible JSON. Remember: JSON only, no markdown fences.",
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }

  const raw = textBlock.text.trim();
  const cleaned = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
    : raw;

  let parsed: StoryBible;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Story Bible JSON: ${(err as Error).message}\n\nRaw output:\n${raw.slice(0, 500)}`,
    );
  }

  parsed.book_length = bookText.length;
  return parsed;
}

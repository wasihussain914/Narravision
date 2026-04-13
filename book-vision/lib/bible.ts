import { getGemini, GEMINI_TEXT_MODEL } from "./gemini";
import type { StoryBible } from "./types";

const SYSTEM_PROMPT = `You are a literary analyst building a "Story Bible" for an illustrated reading experience.

Given the full text of a book, output a single JSON object describing the cast, settings, art direction, and a scene index. The JSON will be used to generate illustrations as a reader scrolls through the book.

CRITICAL: start_char and end_char are BYTE POSITIONS in the text string. For example, if the book is 200,000 characters long:
- First scene might be: start_char: 0, end_char: 15000 (the first 15,000 characters)
- Second scene might be: start_char: 15000, end_char: 28000 (next 13,000 characters)
- Last scene ends at the book's total character count (e.g. 200000)

These are NOT page numbers, chapter numbers, or line numbers - they are actual string positions!

Hard requirements:
- Return ONLY valid JSON. No prose, no markdown fences.
- Scenes should be semantic units (location/time/POV shifts), not paragraphs or chapters. Aim for 15-40 scenes for a typical novel.
- Each scene should be several thousand characters long (not just a few characters!)
- start_char and end_char must cover the entire book with no gaps
- present_characters and present_locations list names that MUST also exist in the top-level characters/locations arrays.
- first_appears_at is the character offset where the entity first shows up (also a large number like 5000, 12000, etc.)
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

export async function buildStoryBible(bookText: string, title: string): Promise<StoryBible> {
  const prompt = `${SYSTEM_PROMPT}

BOOK TITLE: ${title}

BOOK TEXT:
${bookText}

Analyze the book above and return the Story Bible JSON. Remember: JSON only, no markdown fences.`;

  const response = await getGemini().models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 16000,
      temperature: 0.1,
    },
  });

  const textPart = response.candidates?.[0]?.content?.parts?.find((p) => p.text);
  if (!textPart || !textPart.text) {
    throw new Error("Gemini returned no text content");
  }

  const raw = textPart.text.trim();
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

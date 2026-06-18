/**
 * A character extracted from the ingested book by Claude during `npm run ingest`.
 *
 * Visual descriptions are illustrator-focused — appearance, clothing, posture,
 * age, and distinguishing features — with no plot spoilers.
 */
export interface Character {
  /** Display name exactly as it appears in the book. */
  name: string;
  /**
   * 1–2 sentence description of what an illustrator would need to draw this
   * character: physical appearance, clothing, and distinguishing features.
   * No plot details.
   */
  visual_description: string;
  /**
   * Zero-indexed character offset of the scene where this character first
   * appears. Matches `Scene.start_char` for that scene.
   */
  first_appears_at: number;
}

/**
 * A named setting (place, room, environment) extracted by Claude during ingestion.
 *
 * Same shape as {@link Character}: the `visual_description` is what an
 * illustrator needs to render the space; `first_appears_at` anchors it to the
 * book text via a character offset.
 */
export interface Location {
  /** Display name exactly as it appears in the book. */
  name: string;
  /**
   * 1–2 sentence illustrator-focused description of the space: atmosphere,
   * dominant colours, architectural features. No plot details.
   */
  visual_description: string;
  /**
   * Zero-indexed character offset of the scene where this location first
   * appears. Matches `Scene.start_char` for that scene.
   */
  first_appears_at: number;
}

/**
 * Overall visual style guidance for illustrations, inferred by Claude from the
 * prose's tone and genre during ingestion.
 *
 * All three fields are short strings suitable for passing directly into an
 * image-generation prompt (e.g. `generateImage` in `lib/image-gen.ts`).
 *
 * @example
 * // { style: "noir charcoal", palette: "deep blues, amber highlights", mood: "tense, shadowy" }
 */
export interface ArtDirection {
  /** Illustration medium and aesthetic (e.g. "muted sci-fi gouache", "ink and watercolor"). */
  style: string;
  /** Dominant color palette as a short comma-separated list. */
  palette: string;
  /** Atmospheric tone (e.g. "melancholic", "hopeful", "tense"). */
  mood: string;
}

/**
 * A semantic unit of the book — a shift in location, time, or point of view.
 *
 * Scenes are the core rendering unit: each one drives a generated illustration
 * and optional narration. Character offsets (`start_char`/`end_char`) index
 * directly into the raw `data/book.txt` string loaded by `loadBook()`.
 *
 * @example
 * const book = loadBook();
 * const excerpt = book.slice(scene.start_char, scene.end_char);
 */
export interface Scene {
  /** Sequential 1-based scene index assigned by Claude during ingestion. */
  id: number;
  /** Zero-indexed character offset where this scene begins in `data/book.txt`. */
  start_char: number;
  /** Zero-indexed character offset where this scene ends (exclusive) in `data/book.txt`. */
  end_char: number;
  /** One-sentence synopsis of what happens in this scene. */
  summary: string;
  /**
   * Names of characters present in this scene. Each entry must match a
   * `Character.name` in the parent `StoryBible.characters` array.
   */
  present_characters: string[];
  /**
   * Names of locations featured in this scene. Each entry must match a
   * `Location.name` in the parent `StoryBible.locations` array.
   */
  present_locations: string[];
}

/**
 * Top-level narrative structure produced by `buildStoryBible()` (lib/bible.ts)
 * and persisted to `data/bible.json` by `npm run ingest`.
 *
 * At runtime, `loadBible()` (lib/store.ts) deserialises this file and caches
 * it in memory for the lifetime of the Next.js server process. Every API route
 * (`/api/bible`, `/api/scene/[id]/*`) reads from this cached bible.
 *
 * @see {@link buildStoryBible} for how this is generated.
 * @see {@link loadBible} for how it is loaded at runtime.
 */
export interface StoryBible {
  /** Book title forwarded to Claude during ingestion. */
  title: string;
  /** Visual style guidance derived from the book's prose and genre. */
  art_direction: ArtDirection;
  /** All named characters extracted from the book. */
  characters: Character[];
  /** All named locations/settings extracted from the book. */
  locations: Location[];
  /**
   * Ordered list of semantic scenes covering the full book.
   * Scenes are non-overlapping and collectively span the full text
   * (i.e. `scenes[0].start_char === 0` and
   * `scenes[last].end_char === book_length`).
   */
  scenes: Scene[];
  /**
   * Total character count of the ingested `data/book.txt`.
   * Set by `buildStoryBible()` after parsing; equals `book.length`.
   */
  book_length: number;
}

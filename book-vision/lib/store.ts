import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StoryBible } from "./types";

/**
 * In-process singleton cache for the parsed {@link StoryBible}.
 * Populated on the first {@link loadBible} call and reused for the lifetime
 * of the Node process (i.e. across all API route invocations in the same
 * Next.js server instance).
 */
let cachedBible: StoryBible | null = null;

/**
 * In-process singleton cache for the raw book text.
 * Same lifecycle as {@link cachedBible}.
 */
let cachedBook: string | null = null;

const BIBLE_PATH = resolve(process.cwd(), "data/bible.json");
const BOOK_PATH = resolve(process.cwd(), "data/book.txt");

/**
 * Load (and cache) the story bible produced by `npm run ingest`.
 *
 * The bible encodes the full narrative structure of the ingested book:
 * characters with visual descriptions, canonical locations, scene list with
 * character/location offsets, art direction, and total book length.
 *
 * @returns The parsed {@link StoryBible} object. Subsequent calls return the
 *   same reference — no disk I/O after the first call.
 * @throws {Error} If `data/bible.json` does not exist (i.e. ingest has not
 *   been run yet). The error message includes the remediation command.
 *
 * @example
 * const bible = loadBible();
 * console.log(bible.title, bible.scenes.length);
 */
export function loadBible(): StoryBible {
  if (cachedBible) return cachedBible;
  if (!existsSync(BIBLE_PATH)) {
    throw new Error(
      "data/bible.json not found. Run `npm run ingest` after dropping a book at data/book.txt.",
    );
  }
  cachedBible = JSON.parse(readFileSync(BIBLE_PATH, "utf8")) as StoryBible;
  return cachedBible;
}

/**
 * Load (and cache) the raw UTF-8 text of the ingested book.
 *
 * Scene objects in the {@link StoryBible} record character offsets
 * (`start_char` / `end_char`) into this string, so it must be the same
 * `data/book.txt` that was used during ingestion.
 *
 * @returns The full book text as a string. Subsequent calls return the cached
 *   value — no disk I/O after the first call.
 * @throws {Error} If `data/book.txt` does not exist.
 *
 * @example
 * const book = loadBook();
 * const scene = loadBible().scenes[0];
 * const excerpt = book.slice(scene.start_char, scene.end_char);
 */
export function loadBook(): string {
  if (cachedBook) return cachedBook;
  if (!existsSync(BOOK_PATH)) {
    throw new Error("data/book.txt not found.");
  }
  cachedBook = readFileSync(BOOK_PATH, "utf8");
  return cachedBook;
}

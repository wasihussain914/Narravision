import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StoryBible } from "./types";

let cachedBible: StoryBible | null = null;
let cachedBook: string | null = null;

const BIBLE_PATH = resolve(process.cwd(), "data/bible.json");
const BOOK_PATH = resolve(process.cwd(), "data/book.txt");

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

export function loadBook(): string {
  if (cachedBook) return cachedBook;
  if (!existsSync(BOOK_PATH)) {
    throw new Error("data/book.txt not found.");
  }
  cachedBook = readFileSync(BOOK_PATH, "utf8");
  return cachedBook;
}

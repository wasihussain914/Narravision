import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { buildStoryBible } from "../lib/bible";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const bookPath = resolve(process.cwd(), "data/book.txt");
  const biblePath = resolve(process.cwd(), "data/bible.json");

  if (!existsSync(bookPath)) {
    console.error(`Missing ${bookPath}. Drop the book text there first.`);
    process.exit(1);
  }

  const fullText = readFileSync(bookPath, "utf8");
  const title = process.env.BOOK_TITLE ?? "Untitled";
  const maxChars = Number(process.env.MAX_BOOK_CHARS ?? 200_000);

  let bookText = fullText;
  if (fullText.length > maxChars) {
    bookText = fullText.slice(0, maxChars);
    console.log(
      `Note: book is ${fullText.length.toLocaleString()} chars, truncating to first ${maxChars.toLocaleString()} (set MAX_BOOK_CHARS to override).`,
    );
    // Persist the truncated copy so the reader and API serve the same text the bible was built from.
    writeFileSync(bookPath, bookText);
  }

  console.log(`Ingesting "${title}" (${bookText.length.toLocaleString()} chars)...`);
  const start = Date.now();
  const bible = await buildStoryBible(bookText, title);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  writeFileSync(biblePath, JSON.stringify(bible, null, 2));
  console.log(
    `Done in ${elapsed}s. ${bible.characters.length} characters, ${bible.locations.length} locations, ${bible.scenes.length} scenes.`,
  );
  console.log(`Saved to ${biblePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { loadBible, loadBook } from "@/lib/store";

/**
 * `GET /api/bible`
 *
 * Returns the full story-bible and raw book text for the ingested book,
 * enabling the client to resolve scene metadata and perform character/location
 * lookups without additional round-trips.
 *
 * Both values are served from in-process singleton caches populated by
 * `npm run ingest`; disk I/O only occurs on the first request after a cold
 * server start.
 *
 * @returns
 *   **200** `{ bible: StoryBible, book: string }` — the parsed narrative
 *   structure (characters, locations, scenes with `start_char`/`end_char`
 *   offsets, art direction, total book length) plus the raw UTF-8 book text
 *   that those offsets index into.
 *
 *   **500** `{ error: string }` — either `data/bible.json` or `data/book.txt`
 *   is missing because `npm run ingest` has not been run yet.
 */
export async function GET() {
  try {
    const bible = loadBible();
    const book = loadBook();
    return Response.json({
      bible,
      book,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

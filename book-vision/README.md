# book-vision

The Next.js app for Narravision. See the [root README](../README.md) for full setup and usage instructions.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in API keys

# Drop your book's plain text into data/book.txt
# (see data/book.txt.example for format + tips; Project Gutenberg .txt files work great)
cp data/book.txt.example data/book.txt   # then replace the sample text with your book

npm run ingest                      # build story bible (~30–60s, calls Claude)
npm run dev                         # open http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run ingest` | Analyze book.txt → data/bible.json (run once per book) |

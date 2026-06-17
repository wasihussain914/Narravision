# book-vision

The Next.js app for Narravision. See the [root README](../README.md) for full setup and usage instructions.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # fill in API keys
# drop a plaintext book at data/book.txt, then:
npm run ingest                      # build story bible (~30–60s)
npm run dev                         # open http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run ingest` | Analyze book.txt → data/bible.json (run once per book) |

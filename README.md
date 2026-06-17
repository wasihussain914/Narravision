# Narravision

**AI-powered illustrated book reader.** Drop in any plaintext book; Narravision generates a scene-by-scene visual and audio companion as you read — consistent illustrations, spoken narration, and spoiler-safe Q&A, all driven by Claude and Gemini.

Built for the [Claude AI Hackathon](https://anthropic.com).

---

## What it does

When you load a book, Narravision runs a one-time **ingest** step where Claude Sonnet reads the full text and produces a "Story Bible" — a structured index of every character (with visual descriptions), every location, every scene boundary, and an art direction palette for the whole book.

As you scroll through the text, three AI features unlock for each scene:

| Feature | How it works |
|---|---|
| **Illustration** | Gemini generates a scene image using the Story Bible's canonical character and location descriptions — so Harry looks the same in chapter 1 and chapter 20. |
| **Narration** | Click to hear 2–3 sentences of spoken context about the current scene. Claude writes the commentary; Cartesia TTS voices it. Audio is cached so repeat listens are instant. |
| **Scene Q&A** | Ask anything about what you've read. Claude answers using only context up to your current scene — no spoilers, ever. |

A **blur-until-tap** spoiler shield hides unread content until you're ready.

---

## Tech stack

- **Next.js 16** + **React 19** + **TypeScript** + **Tailwind CSS**
- **Anthropic Claude Sonnet** — story bible generation, image prompts, narration text, Q&A
- **Google Gemini** (`gemini-3-pro-image-preview`) — scene illustration
- **Cartesia TTS** (`sonic-2`) — voice narration synthesis

---

## Getting started

### 1. Install dependencies

```bash
cd book-vision
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in:

```
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
CARTESIA_API_KEY=your_cartesia_key
# Optional: override the default narrator voice
# CARTESIA_VOICE_ID=a0e99841-438c-4a64-b679-ae501e7d6091
```

### 3. Ingest a book

Drop a plaintext `.txt` file at `book-vision/data/book.txt`, then run:

```bash
npm run ingest
```

This calls Claude to analyze the full text and writes `data/bible.json`. For a typical novel (~300 pages) this takes 30–60 seconds and consumes roughly 100K tokens.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Scroll through the book — illustrations, narration, and Q&A load on demand per scene.

---

## Project structure

```
book-vision/
  app/
    Reader.tsx          # Main reading UI (scroll tracking, scene detection, media panels)
    api/
      bible/route.ts    # Serves the story bible + raw book text
      scene/[id]/
        image/route.ts    # Generate/cache scene illustration
        narrate/route.ts  # Generate/cache narration text + TTS audio
        ask/route.ts      # Spoiler-safe scene Q&A
  lib/
    bible.ts            # Claude prompt that builds the Story Bible JSON
    prompt-builder.ts   # Assembles image generation prompts with canonical descriptions
    narration.ts        # Claude narration text + Cartesia TTS synthesis
    qa-context.ts       # Spoiler-free context builder for scene Q&A
    image-gen.ts        # Gemini image generation with local caching
    store.ts            # In-memory cache for bible + book text
    types.ts            # Shared TypeScript types (Scene, StoryBible, etc.)
  scripts/
    ingest.ts           # One-time book analysis → data/bible.json
```

---

## Notes

- Generated images are cached at `public/images/<hash>.png`; narration audio at `public/audio/<hash>.mp3`. Delete these directories to regenerate.
- The Q&A endpoint uses prompt caching (Anthropic ephemeral cache) to keep costs low on long sessions.
- Any plaintext book works — the repo ships with `harrypotter.txt` as a sample. Replace `data/book.txt` with any other `.txt` file and re-run ingest.

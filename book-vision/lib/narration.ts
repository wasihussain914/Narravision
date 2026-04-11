import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAnthropic, CLAUDE_MODEL } from "./anthropic";
import type { Scene, StoryBible } from "./types";

const NARRATION_SYSTEM = `You are a warm, thoughtful literary companion speaking aloud to someone who is reading a book right now. Given the story bible and the current scene, write 2-3 short sentences of spoken context for the listener. Focus on: who is present in this moment, the emotional or thematic shift happening here, and one observation that deepens the reading. Do NOT spoil anything beyond this scene. Do NOT summarize the plot broadly. Speak naturally, like a friend sitting next to them. Output plain prose only — no headings, no quotes, no stage directions, no markdown.`;

export interface NarrationInput {
  bible: StoryBible;
  scene: Scene;
  sceneText: string;
}

export async function buildNarrationText({
  bible,
  scene,
  sceneText,
}: NarrationInput): Promise<string> {
  const presentChars = bible.characters
    .filter((c) => scene.present_characters.includes(c.name))
    .map((c) => `- ${c.name}: ${c.visual_description}`)
    .join("\n");

  const context = [
    `BOOK: ${bible.title}`,
    ``,
    `CHARACTERS IN SCENE:`,
    presentChars || "(none)",
    ``,
    `SCENE SUMMARY: ${scene.summary}`,
    ``,
    `SCENE TEXT:`,
    sceneText,
  ].join("\n");

  const res = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 220,
    system: NARRATION_SYSTEM,
    messages: [{ role: "user", content: context }],
  });

  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no narration text");
  }
  return block.text.trim();
}

const CARTESIA_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_VERSION = "2024-11-13";
const CARTESIA_MODEL = "sonic-2";
// Warm narrator voice from Cartesia's public voice library. Override with CARTESIA_VOICE_ID.
const DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";

function ensureAudioDir(): string {
  const dir = resolve(process.cwd(), "public/audio");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function hashText(text: string, voiceId: string): string {
  return createHash("sha256").update(`${voiceId}::${text}`).digest("hex").slice(0, 16);
}

export interface GeneratedNarration {
  audioUrl: string;
  cached: boolean;
}

export async function synthesizeNarration(text: string): Promise<GeneratedNarration> {
  if (!process.env.CARTESIA_API_KEY) {
    throw new Error("CARTESIA_API_KEY is not set");
  }
  const voiceId = process.env.CARTESIA_VOICE_ID ?? DEFAULT_VOICE_ID;

  const dir = ensureAudioDir();
  const hash = hashText(text, voiceId);
  const filename = `${hash}.mp3`;
  const filepath = resolve(dir, filename);
  const audioUrl = `/audio/${filename}`;

  if (existsSync(filepath)) {
    return { audioUrl, cached: true };
  }

  const res = await fetch(CARTESIA_URL, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.CARTESIA_API_KEY,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: CARTESIA_MODEL,
      transcript: text,
      voice: { mode: "id", id: voiceId },
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
      language: "en",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cartesia TTS failed: ${res.status} ${errText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buffer);

  return { audioUrl, cached: false };
}

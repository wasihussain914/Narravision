import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";

let client: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (client) return client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const IMAGE_MODEL = "gemini-3-pro-image-preview";

function ensureImagesDir(): string {
  const dir = resolve(process.cwd(), "public/images");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/** Result returned by {@link generateImage}. */
export interface GeneratedImage {
  /** Root-relative URL of the saved image, e.g. `/images/<hash>.png`. */
  url: string;
  /**
   * `true` when the image was already present on disk and no API call was made;
   * `false` when a new Gemini request was issued.
   */
  cached: boolean;
}

/**
 * Generate a PNG image for the given text prompt using Gemini's image model
 * and persist it under `public/images/<sha256[:16]>.png`.
 *
 * The function is **idempotent**: if an image for the same prompt already
 * exists on disk it is returned immediately without calling the API.
 *
 * @param prompt - Natural-language description of the scene to render.
 * @returns URL of the image (root-relative, ready for Next.js `<Image>` src)
 *   together with a `cached` flag indicating whether the API was called.
 * @throws {Error} If `GEMINI_API_KEY` is not set in the environment.
 * @throws {Error} If Gemini returns a response with no image data.
 *
 * @example
 * const { url, cached } = await generateImage("A moonlit Victorian library");
 * // url → "/images/3f9a2b1c8e4d7f60.png"
 *
 * @requires GEMINI_API_KEY — Google Generative AI API key with access to
 *   `gemini-3-pro-image-preview` (image generation modality).
 */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const dir = ensureImagesDir();
  const hash = hashPrompt(prompt);
  const filename = `${hash}.png`;
  const filepath = resolve(dir, filename);
  const url = `/images/${filename}`;

  if (existsSync(filepath)) {
    return { url, cached: true };
  }

  const response = await getGemini().models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error("Gemini returned no image data");
  }

  const buffer = Buffer.from(imagePart.inlineData.data, "base64");
  writeFileSync(filepath, buffer);

  return { url, cached: false };
}

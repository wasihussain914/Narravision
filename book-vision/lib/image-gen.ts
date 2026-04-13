import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Modality } from "@google/genai";
import { getGemini, GEMINI_IMAGE_MODEL } from "./gemini";

function ensureImagesDir(): string {
  const dir = resolve(process.cwd(), "public/images");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

export interface GeneratedImage {
  url: string;
  cached: boolean;
}

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
    model: GEMINI_IMAGE_MODEL,
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

import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (client) return client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

// Text model for story analysis, narration, and Q&A
export const GEMINI_TEXT_MODEL = "gemini-3.1-flash-lite-preview";

// Image generation model
export const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

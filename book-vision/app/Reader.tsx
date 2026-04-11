"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoryBible, Scene } from "@/lib/types";

interface BibleResponse {
  bible: StoryBible;
  book: string;
}

interface SceneImageResponse {
  sceneId: number;
  prompt: string;
  url: string;
  cached: boolean;
}

type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; prompt: string }
  | { status: "error"; message: string };

export default function Reader() {
  const [data, setData] = useState<BibleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState<number | null>(null);
  const [blurUntilTap, setBlurUntilTap] = useState(true);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const imagesRef = useRef<Record<number, ImageState>>({});
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  useEffect(() => {
    fetch("/api/bible")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "failed to load");
        return r.json() as Promise<BibleResponse>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const fetchImage = useCallback(async (sceneId: number) => {
    if (imagesRef.current[sceneId]?.status === "loading") return;
    if (imagesRef.current[sceneId]?.status === "ready") return;
    imagesRef.current[sceneId] = { status: "loading" };
    rerender();
    try {
      const res = await fetch(`/api/scene/${sceneId}/image`);
      const body = (await res.json()) as SceneImageResponse | { error: string };
      if (!res.ok || "error" in body) {
        imagesRef.current[sceneId] = {
          status: "error",
          message: "error" in body ? body.error : "failed",
        };
      } else {
        imagesRef.current[sceneId] = {
          status: "ready",
          url: body.url,
          prompt: body.prompt,
        };
      }
    } catch (e) {
      imagesRef.current[sceneId] = {
        status: "error",
        message: (e as Error).message,
      };
    }
    rerender();
  }, [rerender]);

  const scenes = data?.bible.scenes ?? [];
  const paragraphs = useMemo(() => {
    if (!data) return [] as { scene: Scene; text: string }[];
    return data.bible.scenes.map((scene) => ({
      scene,
      text: data.book.slice(scene.start_char, scene.end_char),
    }));
  }, [data]);

  useEffect(() => {
    if (!scenes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = Number(visible.target.getAttribute("data-scene-id"));
          setCurrentSceneId(id);
        }
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    document
      .querySelectorAll<HTMLElement>("[data-scene-id]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [scenes.length]);

  useEffect(() => {
    if (currentSceneId == null) return;
    fetchImage(currentSceneId);
    const nextIdx = scenes.findIndex((s) => s.id === currentSceneId) + 1;
    const next = scenes[nextIdx];
    if (next) fetchImage(next.id);
  }, [currentSceneId, fetchImage, scenes]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-zinc-800 dark:text-zinc-200">
        <div className="max-w-lg rounded-lg border border-red-300 bg-red-50 p-6 text-sm dark:border-red-900 dark:bg-red-950">
          <div className="mb-2 font-semibold">Setup needed</div>
          <div className="whitespace-pre-wrap">{error}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading…
      </div>
    );
  }

  const current = imagesRef.current[currentSceneId ?? -1];
  const currentScene = scenes.find((s) => s.id === currentSceneId);
  const isRevealed = currentSceneId != null && revealed[currentSceneId];
  const shouldBlur = blurUntilTap && !isRevealed;

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row">
      <main className="w-full flex-1 overflow-y-auto px-6 py-16 lg:w-1/2 lg:max-w-2xl lg:px-12">
        <header className="mb-12 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <h1 className="text-3xl font-semibold tracking-tight">
            {data.bible.title}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {scenes.length} scenes · {data.bible.characters.length} characters
          </p>
          <label className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={blurUntilTap}
              onChange={(e) => setBlurUntilTap(e.target.checked)}
            />
            blur images until tapped (so you picture it first)
          </label>
        </header>
        <article className="space-y-8 text-[17px] leading-8 text-zinc-800 dark:text-zinc-200">
          {paragraphs.map(({ scene, text }) => (
            <section
              key={scene.id}
              data-scene-id={scene.id}
              className={`rounded-md border-l-2 pl-4 transition-colors ${
                currentSceneId === scene.id
                  ? "border-amber-500"
                  : "border-transparent"
              }`}
            >
              <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-400">
                Scene {scene.id}
              </div>
              <div className="whitespace-pre-wrap">{text}</div>
            </section>
          ))}
        </article>
      </main>
      <aside className="sticky top-0 h-screen w-full border-t border-zinc-200 bg-zinc-50 p-6 lg:w-1/2 lg:border-l lg:border-t-0 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-full flex-col">
          <div className="mb-4 text-xs uppercase tracking-widest text-zinc-500">
            {currentScene ? `Scene ${currentScene.id}` : "scroll to begin"}
          </div>
          <div
            className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-900"
            onClick={() => {
              if (currentSceneId != null) {
                setRevealed((r) => ({ ...r, [currentSceneId]: true }));
              }
            }}
          >
            {current?.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={currentScene?.summary ?? ""}
                className={`h-full w-full object-cover transition-all duration-500 ${
                  shouldBlur ? "scale-105 blur-xl" : "blur-0"
                }`}
              />
            ) : current?.status === "loading" ? (
              <div className="animate-pulse text-zinc-400">imagining…</div>
            ) : current?.status === "error" ? (
              <div className="p-4 text-sm text-red-500">{current.message}</div>
            ) : (
              <div className="text-zinc-400">scroll the book →</div>
            )}
            {shouldBlur && current?.status === "ready" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-black/60 px-4 py-2 text-xs text-white">
                  tap to reveal
                </span>
              </div>
            )}
          </div>
          {currentScene && (
            <div className="mt-4 text-xs text-zinc-500">
              {currentScene.summary}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

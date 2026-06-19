"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scene, StoryBible } from "@/lib/types";

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

interface SceneNarrationResponse {
  sceneId: number;
  text: string;
  audioUrl: string;
  cached: boolean;
}

type ImageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string; prompt: string }
  | { status: "error"; message: string };

type NarrationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; text: string; audioUrl: string }
  | { status: "error"; message: string };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  audioUrl?: string | null;
  autoplay?: boolean;
}

interface SceneQAResponse {
  sceneId: number;
  question: string;
  answer: string;
  audioUrl: string | null;
}

interface ParagraphBlock {
  scene: Scene;
  text: string;
}

export default function Reader() {
  const [data, setData] = useState<BibleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState<number | null>(null);
  const [blurUntilTap, setBlurUntilTap] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const imagesRef = useRef<Record<number, ImageState>>({});
  const narrationsRef = useRef<Record<number, NarrationState>>({});
  const [chatMessages, setChatMessages] = useState<Record<number, ChatMessage[]>>({});
  const [chatLoading, setChatLoading] = useState(false);
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

  const fetchImage = useCallback(
    async (sceneId: number) => {
      const existing = imagesRef.current[sceneId];
      if (existing?.status === "loading" || existing?.status === "ready") return;
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
    },
    [rerender],
  );

  const bible = data?.bible ?? null;
  const scenes = bible?.scenes ?? [];
  const paragraphs: ParagraphBlock[] = useMemo(() => {
    if (!data) return [];
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
      { rootMargin: "-35% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
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

  const fetchNarration = useCallback(
    async (sceneId: number) => {
      const existing = narrationsRef.current[sceneId];
      if (existing?.status === "loading" || existing?.status === "ready") return;
      narrationsRef.current[sceneId] = { status: "loading" };
      rerender();
      try {
        const res = await fetch(`/api/scene/${sceneId}/narrate`);
        const body = (await res.json()) as SceneNarrationResponse | { error: string };
        if (!res.ok || "error" in body) {
          narrationsRef.current[sceneId] = {
            status: "error",
            message: "error" in body ? body.error : "failed",
          };
        } else {
          narrationsRef.current[sceneId] = {
            status: "ready",
            text: body.text,
            audioUrl: body.audioUrl,
          };
        }
      } catch (e) {
        narrationsRef.current[sceneId] = {
          status: "error",
          message: (e as Error).message,
        };
      }
      rerender();
    },
    [rerender],
  );

  const askQuestion = useCallback(
    async (question: string, sceneId: number) => {
      setChatLoading(true);
      setChatMessages((prev) => ({
        ...prev,
        [sceneId]: [...(prev[sceneId] ?? []), { role: "user", content: question }],
      }));
      try {
        const res = await fetch(`/api/scene/${sceneId}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        });
        const body = (await res.json()) as SceneQAResponse | { error: string };
        if (!res.ok || "error" in body) {
          setChatMessages((prev) => ({
            ...prev,
            [sceneId]: [
              ...(prev[sceneId] ?? []),
              {
                role: "assistant",
                content: `Error: ${"error" in body ? body.error : "failed to get answer"}`,
              },
            ],
          }));
        } else {
          setChatMessages((prev) => ({
            ...prev,
            [sceneId]: [
              ...(prev[sceneId] ?? []),
              {
                role: "assistant",
                content: body.answer,
                audioUrl: body.audioUrl,
                autoplay: true,
              },
            ],
          }));
        }
      } catch (e) {
        setChatMessages((prev) => ({
          ...prev,
          [sceneId]: [
            ...(prev[sceneId] ?? []),
            { role: "assistant", content: `Error: ${(e as Error).message}` },
          ],
        }));
      } finally {
        setChatLoading(false);
      }
    },
    [],
  );

  const scrollToScene = useCallback((sceneId: number) => {
    const el = document.querySelector<HTMLElement>(`[data-scene-id="${sceneId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!scenes.length || currentSceneId == null) return;
      const idx = scenes.findIndex((s) => s.id === currentSceneId);
      if (e.key === "j" || e.key === "ArrowDown") {
        const next = scenes[idx + 1];
        if (next) {
          e.preventDefault();
          scrollToScene(next.id);
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        const prev = scenes[idx - 1];
        if (prev) {
          e.preventDefault();
          scrollToScene(prev.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scenes, currentSceneId, scrollToScene]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-sm dark:border-red-900/50 dark:bg-red-950/40">
          <div className="mb-2 font-semibold text-red-900 dark:text-red-200">Setup needed</div>
          <div className="whitespace-pre-wrap text-red-800 dark:text-red-300">{error}</div>
        </div>
      </div>
    );
  }

  if (!bible) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[var(--paper-faint)]">
          <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--accent)]" />
          loading
        </div>
      </div>
    );
  }

  const currentIdx = currentSceneId != null ? scenes.findIndex((s) => s.id === currentSceneId) : -1;
  const current = currentSceneId != null ? imagesRef.current[currentSceneId] : undefined;
  const currentNarration = currentSceneId != null ? narrationsRef.current[currentSceneId] : undefined;
  const currentScene = currentIdx >= 0 ? scenes[currentIdx] : null;
  const isRevealed = currentSceneId != null && revealed[currentSceneId];
  const shouldBlur = blurUntilTap && !isRevealed;
  const progress = scenes.length > 0 ? ((currentIdx + 1) / scenes.length) * 100 : 0;

  const presentCharacters = currentScene
    ? bible.characters.filter((c) => currentScene.present_characters.includes(c.name))
    : [];

  return (
    <div className="relative min-h-screen bg-[var(--paper)] text-[var(--foreground)]">
      <Header
        title={bible.title}
        currentIdx={currentIdx}
        totalScenes={scenes.length}
        progress={progress}
      />
      <SceneRail
        scenes={scenes}
        currentSceneId={currentSceneId}
        onJump={scrollToScene}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <BookColumn
          paragraphs={paragraphs}
          currentSceneId={currentSceneId}
          scenes={scenes}
          onJumpScene={scrollToScene}
          blurUntilTap={blurUntilTap}
          setBlurUntilTap={setBlurUntilTap}
        />
        <ImagePanel
          current={current}
          currentScene={currentScene}
          totalScenes={scenes.length}
          currentIdx={currentIdx}
          presentCharacters={presentCharacters}
          shouldBlur={shouldBlur}
          onReveal={() => {
            if (currentSceneId != null) {
              setRevealed((r) => ({ ...r, [currentSceneId]: true }));
            }
          }}
          narration={currentNarration}
          onNarrate={() => {
            if (currentSceneId != null) fetchNarration(currentSceneId);
          }}
          chatMessages={currentSceneId != null ? chatMessages[currentSceneId] ?? [] : []}
          chatLoading={chatLoading}
          onAskQuestion={(question) => {
            if (currentSceneId != null) askQuestion(question, currentSceneId);
          }}
        />
      </div>
    </div>
  );
}

function Header({
  title,
  currentIdx,
  totalScenes,
  progress,
}: {
  title: string;
  currentIdx: number;
  totalScenes: number;
  progress: number;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--paper-border)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="h-[2px] w-full bg-[var(--paper-muted)]">
        <div
          className="h-full bg-[var(--accent)] transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--paper-border)] bg-[var(--paper-elevated)] shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
              {title}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.25em] text-[var(--paper-faint)]">
              {currentIdx >= 0 ? `Scene ${currentIdx + 1} of ${totalScenes}` : `${totalScenes} scenes`}
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
          <span className="text-[10px] uppercase tracking-[0.22em] text-[var(--paper-faint)]">navigate</span>
        </div>
      </div>
    </header>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-[var(--paper-border)] bg-[var(--paper-muted)] px-1.5 font-mono text-[10px] text-[var(--paper-faint)] shadow-sm">
      {children}
    </kbd>
  );
}

function BookColumn({
  paragraphs,
  currentSceneId,
  scenes,
  onJumpScene,
  blurUntilTap,
  setBlurUntilTap,
}: {
  paragraphs: ParagraphBlock[];
  currentSceneId: number | null;
  scenes: Scene[];
  onJumpScene: (id: number) => void;
  blurUntilTap: boolean;
  setBlurUntilTap: (b: boolean) => void;
}) {
  return (
    <main className="px-6 pb-40 pt-14 lg:px-16 lg:pt-20">
      <div className="mx-auto max-w-[620px]">
        <div className="mb-10 flex items-center justify-between">
          <SceneDots
            scenes={scenes}
            currentSceneId={currentSceneId}
            onJump={onJumpScene}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)] px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--paper-faint)] shadow-sm transition-colors hover:text-[var(--foreground)]">
            <input
              type="checkbox"
              checked={blurUntilTap}
              onChange={(e) => setBlurUntilTap(e.target.checked)}
              className="h-3 w-3 accent-[var(--accent)]"
            />
            blur
          </label>
        </div>
        <article className="space-y-16">
          {paragraphs.map(({ scene, text }) => {
            const isCurrent = currentSceneId === scene.id;
            return (
              <section key={scene.id} data-scene-id={scene.id} className="scroll-mt-28">
                <div className="mb-5 flex items-center gap-3">
                  <span
                    className="h-px transition-all duration-500"
                    style={{
                      width: isCurrent ? "3rem" : "2rem",
                      background: isCurrent ? "var(--accent)" : "var(--paper-border)",
                    }}
                  />
                  <span
                    className="text-[10px] uppercase tracking-[0.3em] transition-colors"
                    style={{
                      color: isCurrent ? "var(--accent-soft)" : "var(--paper-faint)",
                    }}
                  >
                    Scene {scene.id}
                  </span>
                </div>
                <div
                  className="whitespace-pre-wrap font-serif text-[18px] leading-[1.85] tracking-[-0.003em] transition-colors duration-500"
                  style={{
                    color: isCurrent ? "var(--foreground)" : "var(--paper-dim)",
                  }}
                >
                  {text}
                </div>
              </section>
            );
          })}
        </article>
      </div>
    </main>
  );
}

function SceneDots({
  scenes,
  currentSceneId,
  onJump,
}: {
  scenes: Scene[];
  currentSceneId: number | null;
  onJump: (id: number) => void;
}) {
  const activeIdx = scenes.findIndex((s) => s.id === currentSceneId);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] tabular-nums text-[var(--paper-faint)]">
        {activeIdx >= 0 ? String(activeIdx + 1).padStart(2, "0") : "--"}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {scenes.map((scene, i) => {
          const active = currentSceneId === scene.id;
          const passed = activeIdx >= 0 && i < activeIdx;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onJump(scene.id)}
              title={`Scene ${i + 1}`}
              className="h-1.5 w-1.5 rounded-full transition-all duration-300 hover:scale-150"
              style={{
                background: active
                  ? "var(--accent)"
                  : passed
                    ? "var(--accent-soft)"
                    : "var(--paper-border)",
                transform: active ? "scale(1.6)" : undefined,
                opacity: active ? 1 : passed ? 0.5 : 1,
              }}
            />
          );
        })}
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[var(--paper-faint)]">
        {String(scenes.length).padStart(2, "0")}
      </span>
    </div>
  );
}

function SceneRail({
  scenes,
  currentSceneId,
  onJump,
}: {
  scenes: Scene[];
  currentSceneId: number | null;
  onJump: (id: number) => void;
}) {
  const activeIdx = scenes.findIndex((s) => s.id === currentSceneId);
  return (
    <div className="pointer-events-none fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 xl:block">
      <div className="pointer-events-auto flex flex-col items-center gap-1.5 rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)]/80 px-2 py-3 shadow-sm backdrop-blur">
        {scenes.map((scene, i) => {
          const active = currentSceneId === scene.id;
          const passed = activeIdx >= 0 && i < activeIdx;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onJump(scene.id)}
              title={`Scene ${i + 1}`}
              className="group relative flex items-center"
            >
              <span
                className="block rounded-full transition-all duration-300"
                style={{
                  height: active ? "1.5rem" : "0.375rem",
                  width: "0.375rem",
                  background: active
                    ? "var(--accent)"
                    : passed
                      ? "var(--accent-soft)"
                      : "var(--paper-border)",
                  opacity: active ? 1 : passed ? 0.6 : 1,
                }}
              />
              <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-md border border-[var(--paper-border)] bg-[var(--paper-elevated)] px-2 py-0.5 font-mono text-[10px] text-[var(--paper-dim)] opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                Scene {i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ImagePanel({
  current,
  currentScene,
  totalScenes,
  currentIdx,
  presentCharacters,
  shouldBlur,
  onReveal,
  narration,
  onNarrate,
  chatMessages,
  chatLoading,
  onAskQuestion,
}: {
  current: ImageState | undefined;
  currentScene: Scene | null;
  totalScenes: number;
  currentIdx: number;
  presentCharacters: { name: string; visual_description: string }[];
  shouldBlur: boolean;
  onReveal: () => void;
  narration: NarrationState | undefined;
  onNarrate: () => void;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  onAskQuestion: (question: string) => void;
}) {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  useEffect(() => {
    if (currentScene == null) return;
    setIsDemoLoading(true);
    const t = setTimeout(() => setIsDemoLoading(false), 3200);
    return () => clearTimeout(t);
  }, [currentScene?.id]);

  const showLoading = current?.status === "loading" || isDemoLoading;

  return (
    <aside className="relative hidden border-l border-[var(--paper-border)] lg:block">
      <div className="dot-grid sticky top-[65px] h-[calc(100vh-65px)] overflow-hidden bg-[var(--paper)]">
        <div className="flex h-full flex-col items-center justify-center px-8 py-10 lg:px-12">
          <div className="mb-6 flex min-h-[28px] flex-wrap items-center justify-center gap-1.5">
            {presentCharacters.length > 0 ? (
              presentCharacters.map((c) => (
                <span
                  key={c.name}
                  className="chip-in inline-flex items-center gap-1.5 rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)] px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-[var(--foreground)] shadow-sm"
                  title={c.visual_description}
                >
                  <span className="inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
                  {c.name}
                </span>
              ))
            ) : (
              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--paper-faint)]">
                &nbsp;
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={shouldBlur ? onReveal : undefined}
            className="soft-shadow relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--paper-border)] bg-[var(--paper-elevated)]"
          >
            {current?.status === "ready" && !showLoading ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.url}
                src={current.url}
                alt={currentScene?.summary ?? ""}
                className={`scene-image-enter h-full w-full object-cover transition-all duration-700 ${
                  shouldBlur ? "scale-110 blur-2xl" : "blur-0"
                }`}
              />
            ) : showLoading ? (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
                <span
                  className="ink-bloom"
                  style={{ left: "12%", top: "18%" }}
                />
                <span
                  className="ink-bloom"
                  style={{ right: "14%", top: "28%", animationDelay: "1.1s" }}
                />
                <span
                  className="ink-bloom"
                  style={{ left: "38%", bottom: "12%", animationDelay: "2.2s" }}
                />
                <span
                  className="ink-bloom"
                  style={{ right: "32%", bottom: "22%", animationDelay: "3.3s" }}
                />
                <span className="shimmer-sweep" />

                <div className="relative z-10 flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)]/85 px-4 py-2 shadow-sm backdrop-blur">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-70" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.28em] text-[var(--foreground)]">
                      Conjuring scene
                    </span>
                    <span className="flex items-end gap-[3px]">
                      <span className="dot-bounce inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
                      <span className="dot-bounce inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
                      <span className="dot-bounce inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
                    </span>
                  </div>
                  <div className="font-serif text-[11px] italic text-[var(--paper-faint)]">
                    brushstrokes finding the page
                  </div>
                </div>
              </div>
            ) : current?.status === "error" ? (
              <div className="flex h-full w-full items-center justify-center p-8 text-center text-xs text-red-500">
                {current.message}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.3em] text-[var(--paper-faint)]">
                scroll the book →
              </div>
            )}

            {shouldBlur && current?.status === "ready" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)]/90 px-4 py-1.5 text-[10px] uppercase tracking-[0.25em] text-[var(--foreground)] shadow-sm backdrop-blur">
                  tap to reveal
                </span>
              </div>
            )}
          </button>

          {currentScene ? (
            <div key={currentScene.id} className="w-full max-w-xl">
              <div className="mt-6 w-full text-center">
                <div className="mb-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--paper-faint)]">
                  <span className="inline-block h-px w-6 bg-[var(--paper-border)]" />
                  Scene {currentIdx + 1} of {totalScenes}
                  <span className="inline-block h-px w-6 bg-[var(--paper-border)]" />
                </div>
                <div className="font-serif text-[13px] italic leading-relaxed text-[var(--paper-faint)]">
                  {currentScene.summary}
                </div>
              </div>

              <NarrateDock narration={narration} onNarrate={onNarrate} />

              <ChatPanel
                messages={chatMessages}
                loading={chatLoading}
                onAskQuestion={onAskQuestion}
                sceneId={currentScene.id}
                totalScenes={totalScenes}
              />
            </div>
          ) : (
            <div className="mt-6 w-full max-w-xl text-center">
              <div className="mb-2 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--paper-faint)]">
                <span className="inline-block h-px w-6 bg-[var(--paper-border)]" />
                ready
                <span className="inline-block h-px w-6 bg-[var(--paper-border)]" />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function NarrateDock({
  narration,
  onNarrate,
}: {
  narration: NarrationState | undefined;
  onNarrate: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayIntent, setAutoplayIntent] = useState(false);
  const state = narration?.status ?? "idle";

  useEffect(() => {
    if (!autoplayIntent) return;
    if (narration?.status !== "ready") return;
    const el = audioRef.current;
    if (!el) return;
    el.play().then(() => setIsPlaying(true)).catch(() => {});
    setAutoplayIntent(false);
  }, [autoplayIntent, narration]);

  const handleClick = () => {
    if (state === "idle" || state === "error") {
      setAutoplayIntent(true);
      onNarrate();
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const label =
    state === "loading"
      ? "Listening in…"
      : state === "ready"
        ? isPlaying
          ? "Playing"
          : "Replay"
        : state === "error"
          ? "Try again"
          : "Tell me about this scene";

  return (
    <div className="mt-8 flex w-full max-w-xl flex-col items-center">
      <div className="relative flex h-14 w-14 items-center justify-center">
        {isPlaying && (
          <>
            <span aria-hidden className="glow-halo" />
            <span aria-hidden className="sonar-ring" />
            <span aria-hidden className="sonar-ring" />
            <span aria-hidden className="sonar-ring" />
          </>
        )}
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        className={`group relative flex h-14 w-14 items-center justify-center rounded-full border border-[var(--paper-border)] bg-[var(--paper-elevated)] transition-transform duration-200 hover:scale-[1.04] active:scale-95 ${
          isPlaying ? "narrate-pulse" : "soft-shadow"
        }`}
        style={{
          background: isPlaying
            ? "var(--accent)"
            : "var(--paper-elevated)",
        }}
      >
        {state === "loading" ? (
          <div
            className="h-5 w-5 animate-spin rounded-full border"
            style={{
              borderColor: "var(--paper-border)",
              borderTopColor: "var(--accent)",
            }}
          />
        ) : isPlaying ? (
          <div className="flex h-5 items-end gap-[3px]">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="wave-bar block w-[3px] rounded-full"
                style={{
                  height: "100%",
                  background: "var(--paper-elevated)",
                }}
              />
            ))}
          </div>
        ) : state === "ready" ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="6 4 20 12 6 20 6 4" fill="var(--accent)" />
          </svg>
        ) : state === "error" ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 4v6h6" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10v4" />
            <path d="M7 7v10" />
            <path d="M11 4v16" />
            <path d="M15 8v8" />
            <path d="M19 11v2" />
          </svg>
        )}
      </button>
      </div>
      <div className="mt-5 text-[10px] uppercase tracking-[0.28em] text-[var(--paper-faint)]">
        {label}
      </div>

      {narration?.status === "ready" && (
        <div className="narration-fade mt-5 w-full rounded-2xl border border-[var(--paper-border)] bg-[var(--paper-elevated)] px-5 py-4 text-left shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] text-[var(--paper-faint)]">
            <span className="inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
            Companion
          </div>
          <p className="font-serif text-[14px] leading-relaxed text-[var(--foreground)]">
            {narration.text}
          </p>
          <audio
            ref={audioRef}
            src={narration.audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            preload="auto"
          />
        </div>
      )}

      {narration?.status === "error" && (
        <div className="narration-fade mt-4 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-[11px] text-red-700">
          {narration.message}
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  messages,
  loading,
  onAskQuestion,
  sceneId,
  totalScenes,
}: {
  messages: ChatMessage[];
  loading: boolean;
  onAskQuestion: (question: string) => void;
  sceneId: number;
  totalScenes: number;
}) {
  const [input, setInput] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onAskQuestion(input.trim());
    setInput("");
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const suggestedQuestions = [
    "Who is in this scene?",
    "What's happening here?",
    "Why did they do that?",
    "What is this location?",
  ];

  return (
    <div className="mt-8 w-full max-w-xl">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex w-full items-center justify-between rounded-2xl border border-[var(--paper-border)] bg-[var(--paper-elevated)] px-5 py-3 shadow-sm transition-all duration-200 hover:border-[var(--accent-soft)]"
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
          <span className="text-[11px] font-medium uppercase tracking-[0.25em] text-[var(--foreground)]">
            Ask Questions
          </span>
          {messages.length > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-[9px] text-white">
              {messages.filter((m) => m.role === "user").length}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="var(--paper-faint)"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="chat-panel-enter mt-4 rounded-2xl border border-[var(--paper-border)] bg-[var(--paper-elevated)] shadow-sm">
          <div className="border-b border-[var(--paper-border)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[9px] uppercase tracking-[0.3em] text-[var(--paper-faint)]">
                Spoiler-Safe Zone
              </div>
              <div className="font-mono text-[9px] tabular-nums text-[var(--accent-soft)]">
                Up to Scene {sceneId}/{totalScenes}
              </div>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] leading-relaxed text-[var(--paper-dim)]">
                  Ask me anything about the story up to this point. I won't spoil future events!
                </p>
                <div className="mt-3 space-y-1.5">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setInput(q);
                      }}
                      className="block w-full rounded-lg border border-[var(--paper-border)] bg-[var(--paper)] px-3 py-2 text-left text-[10px] text-[var(--paper-dim)] transition-colors hover:border-[var(--accent-soft)] hover:text-[var(--foreground)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, i) =>
                  msg.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-[var(--accent)] px-3 py-2 text-[12px] leading-relaxed text-white">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <AssistantBubble key={i} message={msg} />
                  ),
                )}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl border border-[var(--paper-border)] bg-[var(--paper)] px-3 py-2">
                      <div
                        className="h-2 w-2 animate-spin rounded-full border"
                        style={{
                          borderColor: "var(--paper-border)",
                          borderTopColor: "var(--accent)",
                        }}
                      />
                      <span className="text-[10px] text-[var(--paper-faint)]">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[var(--paper-border)] p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                aria-label="Ask a question about this scene"
                disabled={loading}
                className="flex-1 rounded-lg border border-[var(--paper-border)] bg-[var(--paper)] px-3 py-2 text-[12px] text-[var(--foreground)] placeholder-[var(--paper-faint)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const hasAutoplayedRef = useRef(false);

  useEffect(() => {
    if (!message.autoplay || hasAutoplayedRef.current) return;
    if (!message.audioUrl) return;
    const el = audioRef.current;
    if (!el) return;
    hasAutoplayedRef.current = true;
    el.play().then(() => setIsPlaying(true)).catch(() => {});
  }, [message.autoplay, message.audioUrl]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const fakeBarHeights = [
    35, 62, 88, 50, 74, 42, 95, 58, 40, 82, 54, 68, 92, 46, 78, 38, 66, 84, 48, 72, 56, 90,
  ];

  return (
    <div className="flex justify-start">
      <div
        className={`relative max-w-[85%] overflow-hidden rounded-2xl border border-[var(--paper-border)] bg-[var(--paper)] px-3 py-2 text-[12px] leading-relaxed text-[var(--foreground)] ${
          isPlaying ? "bubble-speaking" : ""
        }`}
      >
        {isPlaying && <span aria-hidden className="bubble-shimmer" />}
        <div className="relative flex items-start gap-2">
          <div className="flex-1">{message.content}</div>
          {message.audioUrl && (
            <button
              type="button"
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[var(--paper-border)] transition-colors ${
                isPlaying
                  ? "bg-[var(--accent)]"
                  : "bg-[var(--paper-elevated)] hover:border-[var(--accent-soft)]"
              }`}
            >
              {isPlaying ? (
                <div className="flex h-2.5 items-end gap-[2px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="wave-bar block w-[2px] rounded-full"
                      style={{ height: "100%", background: "var(--paper-elevated)" }}
                    />
                  ))}
                </div>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="var(--accent)"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                >
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
              )}
            </button>
          )}
        </div>
        {isPlaying && (
          <div
            aria-hidden
            className="relative mt-2 flex h-5 items-end gap-[2px] border-t border-dashed border-[var(--paper-border)] pt-2"
          >
            {fakeBarHeights.map((h, i) => (
              <span
                key={i}
                className="wave-bar flex-1 rounded-full bg-[var(--accent)]"
                style={{
                  height: `${h}%`,
                  animationDelay: `${(i * 0.07) % 1.1}s`,
                  animationDuration: `${0.85 + (i % 5) * 0.08}s`,
                  opacity: 0.75,
                }}
              />
            ))}
          </div>
        )}
        {message.audioUrl && (
          <audio
            ref={audioRef}
            src={message.audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            preload="auto"
          />
        )}
      </div>
    </div>
  );
}

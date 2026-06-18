import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chapter Not Found — Book Vision",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6 text-center">
      <p
        className="text-8xl font-serif select-none mb-6"
        style={{ color: "var(--accent)", fontFamily: "var(--font-source-serif)" }}
        aria-hidden="true"
      >
        ✦
      </p>
      <h1
        className="text-3xl font-serif font-semibold mb-3"
        style={{ fontFamily: "var(--font-source-serif)", color: "var(--foreground)" }}
      >
        Chapter Not Found
      </h1>
      <p
        className="text-base mb-8 max-w-sm"
        style={{ color: "var(--paper-dim)" }}
      >
        The page you&rsquo;re looking for seems to have wandered off between the
        pages. Perhaps it was never written, or the ink has faded.
      </p>
      <Link
        href="/"
        className="inline-block px-6 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Return to the Book
      </Link>
    </main>
  );
}

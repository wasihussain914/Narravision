import { loadBible, loadBook } from "@/lib/store";

export async function GET() {
  try {
    const bible = loadBible();
    const book = loadBook();
    return Response.json({
      bible,
      book,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { getJob } from "@/lib/provider";

export const runtime = "nodejs";

// GET /api/video-status?id=...
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "job не найден" }, { status: 404 });
  return NextResponse.json({
    status: job.status, // processing | completed | error
    videoUrl: job.videoUrl || undefined,
    error: job.error || undefined,
  });
}

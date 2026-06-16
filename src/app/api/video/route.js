import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { startVideoJob } from "@/lib/provider";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Accepts multipart/form-data:
//   photos: File[]   (up to 5)
//   scriptText, avatarId, voiceId, watermarkText (strings)
// Returns: { videoId }
export async function POST(req) {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const form = await req.formData();

    const scriptText = String(form.get("scriptText") || "");
    const avatarId = String(form.get("avatarId") || "");
    const voiceId = String(form.get("voiceId") || "");
    const watermarkText = form.get("watermarkText");

    const files = form.getAll("photos").filter((f) => typeof f === "object" && f.size);
    const photoPaths = [];
    for (const f of files.slice(0, 5)) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const dest = path.join(UPLOAD_DIR, `${randomUUID()}.${ext}`);
      const buf = Buffer.from(await f.arrayBuffer());
      await fs.writeFile(dest, buf);
      photoPaths.push(dest);
    }

    if (!scriptText.trim()) {
      return NextResponse.json({ error: "scriptText обязателен" }, { status: 400 });
    }
    if (!photoPaths.length && (process.env.VIDEO_PROVIDER || "mock") === "mock") {
      return NextResponse.json(
        { error: "В mock-режиме нужно загрузить хотя бы одно фото" },
        { status: 400 }
      );
    }

    const videoId = await startVideoJob({
      scriptText,
      avatarId,
      voiceId,
      photoPaths,
      watermarkText: watermarkText == null ? undefined : String(watermarkText),
    });

    return NextResponse.json({ videoId, status: "processing" });
  } catch (e) {
    return NextResponse.json({ error: e.message || "video failed" }, { status: 500 });
  }
}

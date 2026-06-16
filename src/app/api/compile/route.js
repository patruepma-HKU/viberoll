import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { publishFile } from "@/lib/storage";

export const runtime = "nodejs";

const FONT_DIR = "/usr/share/fonts/truetype/google-fonts";
const GEN_DIR = path.join(process.cwd(), "public", "generated");

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-600)))));
  });
}

// Resolve a /generated or /uploads URL to an absolute path; reject anything else.
function localPathFromUrl(u) {
  if (!u) return null;
  if (u.startsWith("/generated/") || u.startsWith("/uploads/")) {
    return path.join(process.cwd(), "public", u);
  }
  return null;
}

// POST { videoUrl, musicUrl?, watermarkText }
// Overlays background music at 30% and a watermark; returns { videoUrl }.
export async function POST(req) {
  try {
    const { videoUrl, musicUrl, watermarkText = "Создано в VibeRoll" } = await req.json();

    // Resolve source video to a local file: local /generated|/uploads path, or
    // download a remote (e.g. R2) URL into a temp file.
    let videoPath = localPathFromUrl(videoUrl);
    let tmpSource = null;
    if (!videoPath) {
      if (!/^https?:\/\//.test(videoUrl || "")) {
        return NextResponse.json(
          { error: "videoUrl должен быть локальным (/generated, /uploads) или http(s)-ссылкой" },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
      tmpSource = path.join(os.tmpdir(), `src-${randomUUID().slice(0, 8)}.mp4`);
      await fs.writeFile(tmpSource, buf);
      videoPath = tmpSource;
    }
    await fs.access(videoPath);
    await fs.mkdir(GEN_DIR, { recursive: true });

    const outName = `reel-${randomUUID().slice(0, 8)}.mp4`;
    const outPath = path.join(GEN_DIR, outName);

    // Build a tiny ASS just for the watermark.
    const ass = path.join(os.tmpdir(), `wm-${randomUUID().slice(0, 8)}.ass`);
    await fs.writeFile(
      ass,
      `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\nStyle: Mark,Poppins,32,&H8CFFFFFF,&H64000000,&H64000000,1,1,2,0,2,40,40,70\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,9:99:99.00,Mark,,0,0,0,,${String(watermarkText).replace(/[{}\n\r]/g, " ")}\n`
    );

    const musicPath = localPathFromUrl(musicUrl);
    const args = ["-hide_banner", "-loglevel", "error", "-i", videoPath];
    if (musicPath) {
      await fs.access(musicPath);
      args.push("-i", musicPath,
        "-filter_complex",
        `[0:v]ass=${ass}:fontsdir=${FONT_DIR}[v];[1:a]volume=0.30[a]`,
        "-map", "[v]", "-map", "[a]");
    } else {
      args.push("-filter_complex", `[0:v]ass=${ass}:fontsdir=${FONT_DIR}[v]`,
        "-map", "[v]", "-map", "0:a?");
    }
    args.push("-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", outPath, "-y");

    await run("ffmpeg", args);
    fs.rm(ass, { force: true }).catch(() => {});
    if (tmpSource) fs.rm(tmpSource, { force: true }).catch(() => {});

    const url = await publishFile(outPath, {
      key: `generated/${outName}`,
      contentType: "video/mp4",
    });
    return NextResponse.json({ videoUrl: url });
  } catch (e) {
    return NextResponse.json({ error: e.message || "compile failed" }, { status: 500 });
  }
}

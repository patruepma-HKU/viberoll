import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { publishFile } from "./storage.js";

const FONT_DIR = "/usr/share/fonts/truetype/google-fonts";
const FONT_FILE = path.join(FONT_DIR, "Poppins-Bold.ttf");
const GEN_DIR = path.join(process.cwd(), "public", "generated");

// Run ffmpeg/ffprobe and resolve on success, reject with stderr on failure.
function run(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${err.slice(-800)}`))
    );
  });
}

// Escape a string for inclusion in an ASS dialogue line.
function assText(s) {
  return String(s || "")
    .replace(/[\r]/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n/g, "\\N");
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// Build an ASS file from timed caption segments + a persistent watermark.
function buildAss(segments, watermarkText) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Cap,Poppins,64,&H00FFFFFF,&H00000000,&H64000000,1,1,4,2,2,80,80,420
Style: Mark,Poppins,32,&H8CFFFFFF,&H64000000,&H64000000,1,1,2,0,2,40,40,70

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const total = segments.reduce((a, s) => a + s.dur, 0);
  let t = 0;
  const lines = segments.map((s) => {
    const start = fmtTime(t);
    t += s.dur;
    const end = fmtTime(t);
    return `Dialogue: 0,${start},${end},Cap,,0,0,0,,${assText(s.text)}`;
  });
  if (watermarkText) {
    lines.push(
      `Dialogue: 0,${fmtTime(0)},${fmtTime(total)},Mark,,0,0,0,,${assText(watermarkText)}`
    );
  }
  return header + lines.join("\n") + "\n";
}

// Split script text into N caption segments of roughly equal length.
function splitIntoSegments(scriptText, count, perSeg) {
  const clean = String(scriptText || "").replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  const segs = [];
  const chunk = Math.max(1, Math.ceil(words.length / count));
  for (let i = 0; i < words.length; i += chunk) {
    let line = words.slice(i, i + chunk).join(" ");
    // wrap to 2 lines around the midpoint for readability
    if (line.length > 22) {
      const parts = line.split(" ");
      const mid = Math.ceil(parts.length / 2);
      line = parts.slice(0, mid).join(" ") + "\n" + parts.slice(mid).join(" ");
    }
    segs.push({ text: line, dur: perSeg });
  }
  return segs.length ? segs : [{ text: clean.slice(0, 60), dur: perSeg }];
}

/**
 * Compile a vertical 1080x1920 reel from photos + script + optional music.
 * Returns the public URL of the produced mp4.
 *
 * @param {object} o
 * @param {string[]} o.photoPaths absolute paths to source images
 * @param {string}   o.scriptText narration / caption text
 * @param {string}  [o.musicPath] absolute path to a music file (mixed at 30%)
 * @param {string}  [o.watermarkText] watermark; empty string disables it
 * @param {string}  [o.headVideoPath] optional talking-head mp4 (heygen) — overrides slideshow
 */
export async function compileReel({
  photoPaths = [],
  scriptText = "",
  musicPath,
  watermarkText = "Создано в VibeRoll",
  headVideoPath,
}) {
  await fs.mkdir(GEN_DIR, { recursive: true });
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "viberoll-"));
  const id = path.basename(work).replace("viberoll-", "");
  const outName = `reel-${id}.mp4`;
  const outPath = path.join(GEN_DIR, outName);

  try {
    let baseVideo; // 1080x1920 silent base before subtitles/music
    let totalDur;

    if (headVideoPath) {
      // HeyGen talking-head path: normalize to vertical canvas, keep its audio later.
      baseVideo = path.join(work, "base.mp4");
      await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-i", headVideoPath,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p",
        "-c:v", "libx264", "-r", "25", "-an", baseVideo, "-y",
      ], work);
      // probe duration
      totalDur = await probeDuration(headVideoPath);
    } else {
      // Slideshow path: Ken Burns clip per photo, ~3s each.
      const perPhoto = 3;
      const photos = photoPaths.length ? photoPaths : [];
      if (!photos.length) throw new Error("Нужно хотя бы одно фото для слайд-шоу");
      const clips = [];
      for (let i = 0; i < photos.length; i++) {
        const clip = path.join(work, `clip${i}.mp4`);
        await run("ffmpeg", [
          "-hide_banner", "-loglevel", "error", "-loop", "1", "-i", photos[i],
          "-t", String(perPhoto),
          "-vf",
          "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920," +
            "zoompan=z='min(zoom+0.0015,1.15)':d=75:s=1080x1920:fps=25,setsar=1,format=yuv420p",
          "-c:v", "libx264", "-r", "25", clip, "-y",
        ], work);
        clips.push(clip);
      }
      const listFile = path.join(work, "list.txt");
      await fs.writeFile(listFile, clips.map((c) => `file '${c}'`).join("\n") + "\n");
      baseVideo = path.join(work, "base.mp4");
      await run("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", listFile, "-c", "copy", baseVideo, "-y",
      ], work);
      totalDur = photos.length * perPhoto;
    }

    // Build timed captions across the full duration.
    const segCount = Math.max(2, Math.min(6, Math.round(totalDur / 3)));
    const segments = splitIntoSegments(scriptText, segCount, totalDur / segCount);
    const assFile = path.join(work, "subs.ass");
    await fs.writeFile(assFile, buildAss(segments, watermarkText));

    // Final mux: burn subtitles + watermark, mix music at 30% (or talking-head audio).
    const args = ["-hide_banner", "-loglevel", "error", "-i", baseVideo];
    let filter;
    let mapAudio;

    if (headVideoPath && !musicPath) {
      args.push("-i", headVideoPath);
      filter = `[0:v]ass=${assFile}:fontsdir=${FONT_DIR}[v]`;
      mapAudio = ["-map", "[v]", "-map", "1:a?"];
    } else if (musicPath) {
      args.push("-i", musicPath);
      const fadeStart = Math.max(0, totalDur - 1);
      filter =
        `[0:v]ass=${assFile}:fontsdir=${FONT_DIR}[v];` +
        `[1:a]volume=0.30,afade=t=out:st=${fadeStart}:d=1[a]`;
      mapAudio = ["-map", "[v]", "-map", "[a]"];
    } else {
      // No music, no head audio → add silent track so players are happy.
      args.push("-f", "lavfi", "-t", String(totalDur), "-i", "anullsrc=r=44100:cl=stereo");
      filter = `[0:v]ass=${assFile}:fontsdir=${FONT_DIR}[v]`;
      mapAudio = ["-map", "[v]", "-map", "1:a"];
    }

    args.push(
      "-filter_complex", filter,
      ...mapAudio,
      "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", outPath, "-y"
    );
    await run("ffmpeg", args, work);

    // Publish: uploads to R2 if configured (returns absolute URL),
    // otherwise returns the local /generated/... path.
    return await publishFile(outPath, {
      key: `generated/${outName}`,
      contentType: "video/mp4",
    });
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => resolve(parseFloat(out.trim()) || 9));
  });
}

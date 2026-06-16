import { randomUUID } from "crypto";
import path from "path";
import { compileReel } from "./video.js";
import { createJob, getJob as storeGetJob, updateJob } from "./jobstore.js";

const PROVIDER = process.env.VIDEO_PROVIDER || "mock";

// Status lookup — delegates to the job store (Redis or in-memory).
export function getJob(id) {
  return storeGetJob(id);
}

/**
 * Kick off video generation. Returns a jobId immediately; work runs async and
 * status is polled via getJob(). photoPaths are absolute server paths.
 */
export async function startVideoJob({ scriptText, avatarId, voiceId, photoPaths = [], musicPath, watermarkText }) {
  const id = randomUUID();
  await createJob(id);

  (async () => {
    try {
      let headVideoPath;

      if (PROVIDER === "heygen") {
        headVideoPath = await heygenGenerate({ scriptText, avatarId, voiceId });
      }
      // MOCK provider: no talking head — we build a real slideshow reel instead,
      // which still produces a genuine, downloadable, watermarked vertical video.

      const url = await compileReel({
        photoPaths,
        scriptText,
        musicPath,
        watermarkText: watermarkText ?? "Создано в VibeRoll",
        headVideoPath,
      });

      await updateJob(id, { status: "completed", videoUrl: url });
    } catch (e) {
      await updateJob(id, { status: "error", error: e.message || String(e) });
    }
  })();

  return id;
}

/**
 * HeyGen API v2 talking-head generation. Returns an absolute path to a
 * downloaded mp4 of the avatar speaking the script. Only used when
 * VIDEO_PROVIDER=heygen and HEYGEN_API_KEY is set.
 *
 * Реализация-скелет: создаёт видео, поллит статус, скачивает результат во временный файл.
 */
async function heygenGenerate({ scriptText, avatarId, voiceId }) {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY не задан, но VIDEO_PROVIDER=heygen");

  const createRes = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "text", input_text: scriptText, voice_id: voiceId },
        },
      ],
      dimension: { width: 1080, height: 1920 },
    }),
  });
  const created = await createRes.json();
  const videoId = created?.data?.video_id;
  if (!videoId) throw new Error("HeyGen: не получили video_id: " + JSON.stringify(created));

  // Poll status
  const deadline = Date.now() + 5 * 60 * 1000;
  let url;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
      { headers: { "X-Api-Key": key } }
    ).then((r) => r.json());
    const status = st?.data?.status;
    if (status === "completed") {
      url = st.data.video_url;
      break;
    }
    if (status === "failed") throw new Error("HeyGen: генерация не удалась");
  }
  if (!url) throw new Error("HeyGen: таймаут ожидания видео");

  // Download to a temp file
  const os = await import("os");
  const fs = await import("fs/promises");
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const tmp = path.join(os.tmpdir(), `heygen-${videoId}.mp4`);
  await fs.writeFile(tmp, buf);
  return tmp;
}

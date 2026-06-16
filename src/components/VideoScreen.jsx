"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoScreen({ data, onRegenerate, onRestart }) {
  const { videoId } = data;
  const [status, setStatus] = useState("processing");
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(`/api/video-status?id=${videoId}`);
        const json = await res.json();
        if (!active) return;
        if (json.status === "completed") {
          setStatus("completed");
          setVideoUrl(json.videoUrl);
          return;
        }
        if (json.status === "error") {
          setStatus("error");
          setError(json.error || "Генерация не удалась");
          return;
        }
        timer.current = setTimeout(poll, 2000);
      } catch (e) {
        if (active) timer.current = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer.current); };
  }, [videoId]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Ваше видео</h2>

      {status === "processing" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-10 ring-1 ring-white/10">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-viber" />
          <p className="text-sm text-white/70">Собираем ролик… это занимает несколько секунд.</p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-2xl bg-pink-500/10 p-6 ring-1 ring-pink-500/30">
          <p className="text-sm text-pink-300">{error}</p>
        </div>
      )}

      {status === "completed" && videoUrl && (
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl ring-1 ring-white/10">
            <video src={videoUrl} controls playsInline className="aspect-[9/16] w-full bg-black" />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={videoUrl}
              download
              className="rounded-xl bg-gradient-to-r from-viber to-viber2 px-5 py-2.5 text-sm font-semibold"
            >
              Скачать
            </a>
            <button
              onClick={onRegenerate}
              className="rounded-xl bg-white/10 px-5 py-2.5 text-sm hover:bg-white/20"
            >
              Перегенерировать
            </button>
            <button
              onClick={onRestart}
              className="rounded-xl bg-white/5 px-5 py-2.5 text-sm ring-1 ring-white/10 hover:bg-white/10"
            >
              Новый проект
            </button>
          </div>
          <p className="text-center text-xs text-white/40">
            В бесплатном режиме на видео — водяной знак «Создано в VibeRoll».
          </p>
        </div>
      )}
    </div>
  );
}

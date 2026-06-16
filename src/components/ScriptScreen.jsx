"use client";

import { useState } from "react";

export default function ScriptScreen({ data, onVideo, onBack }) {
  const { scripts, photos, avatarId, voiceId } = data;
  const [editingIdx, setEditingIdx] = useState(null);
  const [drafts, setDrafts] = useState(scripts.map((s) => s.script));
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateDraft(i, val) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? val : d)));
  }

  async function generateVideo(i) {
    setError("");
    setSelected(i);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("scriptText", drafts[i]);
      fd.append("avatarId", avatarId);
      fd.append("voiceId", voiceId);
      fd.append("watermarkText", "Создано в VibeRoll");
      photos.forEach((p) => fd.append("photos", p.file));

      const res = await fetch("/api/video", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка запуска генерации");
      onVideo({ videoId: json.videoId });
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-white/60 hover:text-white">← Назад</button>
      <h2 className="text-lg font-semibold">Выберите сценарий</h2>

      {scripts.map((s, i) => (
        <div key={i} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-viber2">{s.title}</span>
          </div>
          {editingIdx === i ? (
            <textarea
              value={drafts[i]}
              onChange={(e) => updateDraft(i, e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-viber"
            />
          ) : (
            <p className="text-sm leading-relaxed text-white/85">{drafts[i]}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setEditingIdx(editingIdx === i ? null : i)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            >
              {editingIdx === i ? "Готово" : "Редактировать"}
            </button>
            <button
              onClick={() => generateVideo(i)}
              disabled={loading}
              className="rounded-lg bg-gradient-to-r from-viber to-viber2 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              {loading && selected === i ? "Запускаем…" : "Сгенерировать видео"}
            </button>
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-pink-400">{error}</p>}
    </div>
  );
}

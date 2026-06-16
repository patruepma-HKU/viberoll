"use client";

import { useRef, useState } from "react";

const STYLES = [
  { id: "young", label: "Молодой и энергичный", avatarId: "avatar_young_demo", voiceId: "voice_young_demo" },
  { id: "expert", label: "Солидный эксперт", avatarId: "avatar_expert_demo", voiceId: "voice_expert_demo" },
  { id: "barber", label: "Креативный барбер", avatarId: "avatar_barber_demo", voiceId: "voice_barber_demo" },
];

export default function UploadScreen({ onScripts }) {
  const [photos, setPhotos] = useState([]); // { file, url }
  const [businessName, setBusinessName] = useState("");
  const [offer, setOffer] = useState("");
  const [style, setStyle] = useState("young");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  function addFiles(fileList) {
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        if (merged.length >= 5) break;
        merged.push({ file: f, url: URL.createObjectURL(f) });
      }
      return merged;
    });
  }

  function removePhoto(i) {
    setPhotos((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[i].url);
      copy.splice(i, 1);
      return copy;
    });
  }

  async function generate() {
    setError("");
    if (!businessName.trim()) return setError("Укажите, что рекламируем.");
    setLoading(true);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, offer, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка генерации");
      const chosen = STYLES.find((s) => s.id === style);
      onScripts({
        scripts: data.scripts,
        photos,
        avatarId: chosen.avatarId,
        voiceId: chosen.voiceId,
        businessName,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition
          ${dragging ? "border-viber bg-viber/10" : "border-white/20 hover:border-white/40"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <p className="text-sm text-white/70">
          Перетащите до 5 фото или нажмите, чтобы выбрать
        </p>
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-5 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-[3/4] overflow-hidden rounded-lg">
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/70">Что рекламируем?</label>
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Например: кофейня «Тёплый угол»"
          className="w-full rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-viber"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/70">Ключевые преимущества</label>
        <textarea
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          rows={3}
          placeholder="Свежая обжарка, уютная атмосфера, первый напиток в подарок…"
          className="w-full resize-none rounded-xl bg-white/5 px-4 py-3 outline-none ring-1 ring-white/10 focus:ring-viber"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-white/70">Стиль ведущего</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`rounded-xl px-3 py-3 text-sm ring-1 transition
                ${style === s.id ? "bg-viber/20 ring-viber" : "bg-white/5 ring-white/10 hover:ring-white/30"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-pink-400">{error}</p>}

      <button
        onClick={generate}
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-viber to-viber2 py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Генерируем сценарии…" : "Сгенерировать сценарии"}
      </button>
    </div>
  );
}

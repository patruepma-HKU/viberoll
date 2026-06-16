"use client";

import { useState } from "react";
import UploadScreen from "@/components/UploadScreen";
import ScriptScreen from "@/components/ScriptScreen";
import VideoScreen from "@/components/VideoScreen";

export default function Page() {
  const [step, setStep] = useState("upload"); // upload | scripts | video
  const [scriptData, setScriptData] = useState(null);
  const [videoData, setVideoData] = useState(null);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="bg-gradient-to-r from-viber to-viber2 bg-clip-text text-3xl font-extrabold text-transparent">
          VibeRoll
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Вертикальные видео-объявления для локального бизнеса за минуты
        </p>
      </header>

      {step === "upload" && (
        <UploadScreen
          onScripts={(data) => { setScriptData(data); setStep("scripts"); }}
        />
      )}

      {step === "scripts" && scriptData && (
        <ScriptScreen
          data={scriptData}
          onBack={() => setStep("upload")}
          onVideo={(vd) => { setVideoData(vd); setStep("video"); }}
        />
      )}

      {step === "video" && videoData && (
        <VideoScreen
          data={videoData}
          onRegenerate={() => setStep("scripts")}
          onRestart={() => { setScriptData(null); setVideoData(null); setStep("upload"); }}
        />
      )}
    </main>
  );
}

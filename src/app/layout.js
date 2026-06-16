import "./globals.css";

export const metadata = {
  title: "VibeRoll — генератор вертикальных видео-объявлений",
  description: "Создавай Reels/TikTok для локального бизнеса за минуты.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

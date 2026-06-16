import { promises as fs } from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// R2 включается, только когда заданы все обязательные переменные.
// Иначе используется локальная раздача из public/generated (как в базовом MVP).
const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_BASE_URL, // напр. https://media.example.com  или  https://pub-xxxx.r2.dev
} = process.env;

const R2_ENABLED =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_BUCKET &&
  !!R2_PUBLIC_BASE_URL;

let _client = null;
function client() {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

export function isR2Enabled() {
  return R2_ENABLED;
}

/**
 * Публикует готовый файл и возвращает URL, по которому его отдавать пользователю.
 *
 * @param {string} localPath абсолютный путь к файлу на диске
 * @param {object} [opts]
 * @param {string} [opts.key] ключ объекта в бакете (по умолчанию generated/<basename>)
 * @param {string} [opts.contentType] MIME (по умолчанию video/mp4)
 * @param {boolean} [opts.cleanupLocal] удалить локальный файл после заливки (по умолчанию true при R2)
 * @returns {Promise<string>} публичный URL
 */
export async function publishFile(localPath, opts = {}) {
  const {
    key = `generated/${path.basename(localPath)}`,
    contentType = "video/mp4",
    cleanupLocal = true,
  } = opts;

  // Без R2 — отдаём локальный относительный путь под /public.
  if (!R2_ENABLED) {
    const publicDir = path.join(process.cwd(), "public");
    if (localPath.startsWith(publicDir)) {
      return localPath.slice(publicDir.length).replace(/\\/g, "/");
    }
    return localPath;
  }

  const body = await fs.readFile(localPath);
  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // кэшируем готовые ролики надолго — они иммутабельны (имя содержит uuid)
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  if (cleanupLocal) {
    fs.rm(localPath, { force: true }).catch(() => {});
  }

  const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key}`;
}

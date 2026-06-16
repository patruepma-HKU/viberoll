import { createClient } from "redis";

// Реестр задач генерации видео.
// Если задан REDIS_URL — состояние хранится в Redis (переживает рестарт,
// общее для всех инстансов). Иначе — in-memory Map (как в базовом MVP,
// только для одного процесса).

const REDIS_URL = process.env.REDIS_URL || "";
const JOB_TTL_SECONDS = Number(process.env.JOB_TTL_SECONDS || 60 * 60); // 1 час
const KEY_PREFIX = "viberoll:job:";

let _client = null;
let _connecting = null;

async function getClient() {
  if (_client && _client.isReady) return _client;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const c = createClient({ url: REDIS_URL });
    c.on("error", (e) => console.error("[redis] client error:", e.message));
    await c.connect();
    _client = c;
    _connecting = null;
    return c;
  })();

  return _connecting;
}

export function isRedisEnabled() {
  return !!REDIS_URL;
}

// ----- In-memory fallback -----
const mem = new Map(); // id -> job object

function memSet(id, job) {
  mem.set(id, job);
  // грубая очистка по TTL, чтобы Map не рос бесконечно
  const expireAt = Date.now() + JOB_TTL_SECONDS * 1000;
  job.__expireAt = expireAt;
  return job;
}

function memGet(id) {
  const job = mem.get(id);
  if (!job) return null;
  if (job.__expireAt && job.__expireAt < Date.now()) {
    mem.delete(id);
    return null;
  }
  const { __expireAt, ...clean } = job;
  return clean;
}

// ----- Public API -----

/**
 * Создаёт запись задачи в статусе processing. Возвращает сохранённый объект.
 */
export async function createJob(id) {
  const job = { status: "processing", videoUrl: null, error: null, createdAt: Date.now() };
  if (isRedisEnabled()) {
    const c = await getClient();
    await c.set(KEY_PREFIX + id, JSON.stringify(job), { EX: JOB_TTL_SECONDS });
  } else {
    memSet(id, { ...job });
  }
  return job;
}

/**
 * Возвращает задачу по id или null.
 */
export async function getJob(id) {
  if (isRedisEnabled()) {
    const c = await getClient();
    const raw = await c.get(KEY_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  }
  return memGet(id);
}

/**
 * Частично обновляет задачу (merge). Сбрасывает TTL заново.
 */
export async function updateJob(id, patch) {
  if (isRedisEnabled()) {
    const c = await getClient();
    const raw = await c.get(KEY_PREFIX + id);
    if (!raw) return null;
    const next = { ...JSON.parse(raw), ...patch };
    await c.set(KEY_PREFIX + id, JSON.stringify(next), { EX: JOB_TTL_SECONDS });
    return next;
  }
  const existing = mem.get(id);
  if (!existing) return null;
  const next = memSet(id, { ...existing, ...patch });
  const { __expireAt, ...clean } = next;
  return clean;
}

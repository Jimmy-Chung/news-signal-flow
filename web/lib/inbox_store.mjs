import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const STORE_VERSION = 1;
let writeQueue = Promise.resolve();

function text(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizedUrl(value) {
  const raw = text(value, 4096);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return raw;
  }
}

function dedupeKey(input) {
  const url = normalizedUrl(input.originalUrl);
  const identity = url
    ? `url:${url}`
    : `story:${text(input.title, 500).toLocaleLowerCase("zh-CN")}|${text(input.source, 120).toLocaleLowerCase("zh-CN")}|${text(input.publishedAt || input.observedAt, 80)}`;
  return crypto.createHash("sha256").update(identity).digest("hex");
}

function publicItem(item) {
  const { dedupeKey, ...value } = item;
  void dedupeKey;
  return value;
}

async function readStore(storePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(storePath, "utf8"));
    if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.items)) {
      throw new Error("Inbox 数据文件版本无效");
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { version: STORE_VERSION, items: [] };
    throw error;
  }
}

async function writeStore(storePath, store) {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temporaryPath, storePath);
}

function withWriteLock(operation) {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.catch(() => {});
  return result;
}

function validateInput(input) {
  const title = text(input?.title, 500);
  const summary = text(input?.summary, 1000);
  const originalUrl = normalizedUrl(input?.originalUrl);
  const entityName = text(input?.entityName, 200);
  const entityType = text(input?.entityType, 80);
  if (!title) throw new Error("新闻标题不能为空");
  if (!summary) throw new Error("DeepSeek 总结不能为空");
  if (!originalUrl) throw new Error("新闻原链接不能为空");
  if (!entityName || !entityType) throw new Error("实体节点信息不完整");
  return {
    title,
    summary,
    originalUrl,
    source: text(input?.source, 120),
    entityId: text(input?.entityId, 160),
    entityName,
    entityType,
    eventId: text(input?.eventId, 160),
    eventType: text(input?.eventType, 80),
    changeType: text(input?.changeType, 80),
    publishedAt: text(input?.publishedAt, 80) || null,
    observedAt: text(input?.observedAt, 80) || null,
  };
}

export async function listInboxItems(storePath) {
  const store = await readStore(storePath);
  return store.items
    .map(publicItem)
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

export async function addInboxItem(storePath, input, now = () => new Date()) {
  return withWriteLock(async () => {
    const normalized = validateInput(input);
    const key = dedupeKey(normalized);
    const store = await readStore(storePath);
    const existing = store.items.find((item) => item.dedupeKey === key);
    if (existing) return { item: publicItem(existing), created: false };

    const addedAt = now().toISOString();
    const item = {
      id: crypto.randomUUID(),
      dedupeKey: key,
      ...normalized,
      addedAt,
      completedAt: null,
    };
    store.items.push(item);
    await writeStore(storePath, store);
    return { item: publicItem(item), created: true };
  });
}

export async function setInboxItemCompleted(storePath, id, completed, now = () => new Date()) {
  return withWriteLock(async () => {
    const itemId = text(id, 160);
    if (!itemId) throw new Error("Inbox 记录 ID 无效");
    const store = await readStore(storePath);
    const item = store.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    item.completedAt = completed ? now().toISOString() : null;
    await writeStore(storePath, store);
    return publicItem(item);
  });
}

export async function removeInboxItem(storePath, id) {
  return withWriteLock(async () => {
    const itemId = text(id, 160);
    if (!itemId) throw new Error("Inbox 记录 ID 无效");
    const store = await readStore(storePath);
    const index = store.items.findIndex((candidate) => candidate.id === itemId);
    if (index < 0) return null;
    const [removed] = store.items.splice(index, 1);
    await writeStore(storePath, store);
    return publicItem(removed);
  });
}

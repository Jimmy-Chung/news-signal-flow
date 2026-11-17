import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addInboxItem, listInboxItems, removeInboxItem, setInboxItemCompleted } from "../lib/inbox_store.mjs";

const input = {
  title: "美联储维持利率不变",
  summary: "美联储宣布维持基准利率不变",
  originalUrl: "https://example.com/news/1?utm_source=test",
  source: "example",
  entityId: "entity-fed",
  entityName: "美联储",
  entityType: "organization",
  eventId: "event-rate",
  eventType: "policy_decision",
  changeType: "regulation",
  publishedAt: "2026-07-30T14:00+08:00",
  observedAt: null,
};

test("Inbox persists, deduplicates by canonical URL, and tracks completion", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "trendradar-inbox-"));
  const storePath = path.join(directory, "inbox.json");
  context.after(() => rm(directory, { recursive: true, force: true }));

  const addedAt = new Date("2026-07-30T10:00:00.000Z");
  const completedAt = new Date("2026-07-30T11:30:00.000Z");
  const first = await addInboxItem(storePath, input, () => addedAt);
  assert.equal(first.created, true);
  assert.equal(first.item.summary, input.summary);
  assert.equal(first.item.entityName, "美联储");
  assert.equal(first.item.entityType, "organization");
  assert.equal(first.item.addedAt, addedAt.toISOString());
  assert.equal(first.item.completedAt, null);

  const duplicate = await addInboxItem(storePath, {
    ...input,
    originalUrl: "https://example.com/news/1?utm_campaign=again#section",
  });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.item.id, first.item.id);
  assert.equal((await listInboxItems(storePath)).length, 1);

  const completed = await setInboxItemCompleted(storePath, first.item.id, true, () => completedAt);
  assert.equal(completed.completedAt, completedAt.toISOString());
  assert.equal((await listInboxItems(storePath))[0].completedAt, completedAt.toISOString());

  const restored = await setInboxItemCompleted(storePath, first.item.id, false);
  assert.equal(restored.completedAt, null);

  const removed = await removeInboxItem(storePath, first.item.id);
  assert.equal(removed.id, first.item.id);
  assert.equal((await listInboxItems(storePath)).length, 0);
  const readded = await addInboxItem(storePath, input);
  assert.equal(readded.created, true);
  assert.notEqual(readded.item.id, first.item.id);
});

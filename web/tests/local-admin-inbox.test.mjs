import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function startAdminServer(directory, token, extraEnv = {}) {
  const configDir = path.join(directory, "config");
  const dataDir = path.join(directory, "data");
  await mkdir(path.join(configDir, "custom/ai"), { recursive: true });
  await mkdir(path.join(dataDir, "web"), { recursive: true });
  await writeFile(path.join(configDir, "custom/ai/user_interests.txt"), "必须提醒：\n- Kimi\n\n感兴趣：\n- AI 产品\n\n明确不要：\n- 广告\n", "utf8");
  await writeFile(path.join(dataDir, "web/entities.json"), JSON.stringify({ meta: { entityCount: 0 }, entities: [] }), "utf8");
  const child = spawn(process.execPath, ["scripts/local_admin_server.mjs"], {
    cwd: webDir,
    env: {
      ...process.env,
      TREND_RADAR_ADMIN_PORT: "0",
      TREND_RADAR_ADMIN_TOKEN: token,
      TREND_RADAR_CONFIG_DIR: configDir,
      TREND_RADAR_DATA_DIR: dataDir,
      TREND_RADAR_INBOX_PATH: path.join(directory, "inbox.json"),
      TREND_RADAR_TRUST_LOCAL_ORIGIN: "false",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`管理服务启动超时：${stderr}`)), 5000);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`管理服务提前退出：${code}\n${stderr}`)));
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, baseUrl: `http://127.0.0.1:${match[1]}` });
    });
  });
}

test("public Inbox API supports the full workflow while management stays protected", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "trendradar-admin-inbox-"));
  const token = "test-admin-token";
  const { child, baseUrl } = await startAdminServer(directory, token, { TREND_RADAR_INBOX_PUBLIC: "true" });
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });

  const publicInbox = await fetch(`${baseUrl}/api/local-admin/inbox`);
  assert.equal(publicInbox.status, 200);
  assert.deepEqual((await publicInbox.json()).items, []);
  const protectedInterests = await fetch(`${baseUrl}/api/local-admin/interests`);
  assert.equal(protectedInterests.status, 401);

  const headers = { "content-type": "application/json" };
  const payload = {
    title: "美联储维持利率不变",
    summary: "美联储宣布维持基准利率不变",
    originalUrl: "https://example.com/fed-rate",
    source: "example",
    entityId: "entity-fed",
    entityName: "美联储",
    entityType: "organization",
    eventId: "event-fed-rate",
    eventType: "policy_decision",
    changeType: "regulation",
    publishedAt: "2026-07-30T14:00+08:00",
    observedAt: null,
  };
  const createdResponse = await fetch(`${baseUrl}/api/local-admin/inbox`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.created, true);
  assert.equal(created.item.summary, payload.summary);

  const duplicateResponse = await fetch(`${baseUrl}/api/local-admin/inbox`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).created, false);

  const completedResponse = await fetch(`${baseUrl}/api/local-admin/inbox/${created.item.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(completedResponse.status, 200);
  assert.ok((await completedResponse.json()).item.completedAt);

  const deletedResponse = await fetch(`${baseUrl}/api/local-admin/inbox/${created.item.id}`, {
    method: "DELETE",
  });
  assert.equal(deletedResponse.status, 200);
  assert.equal((await deletedResponse.json()).item.id, created.item.id);

  const afterDelete = await fetch(`${baseUrl}/api/local-admin/inbox`);
  assert.equal(afterDelete.status, 200);
  const emptyList = await afterDelete.json();
  assert.equal(emptyList.items.length, 0);
  assert.equal(emptyList.pendingCount, 0);
  assert.equal(emptyList.completedCount, 0);

  const readdedResponse = await fetch(`${baseUrl}/api/local-admin/inbox`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(readdedResponse.status, 201);
  assert.equal((await readdedResponse.json()).created, true);

  const listed = await fetch(`${baseUrl}/api/local-admin/inbox`);
  assert.equal(listed.status, 200);
  const list = await listed.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.pendingCount, 1);
  assert.equal(list.completedCount, 0);
});

test("Inbox is protected by default and uses configured config/data paths", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "trendradar-admin-server-"));
  const token = "server-admin-token";
  const { child, baseUrl } = await startAdminServer(directory, token, {
    TREND_RADAR_DEPLOY_MODE: "direct",
  });
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(directory, { recursive: true, force: true });
  });

  const unauthorizedInbox = await fetch(`${baseUrl}/api/local-admin/inbox`);
  assert.equal(unauthorizedInbox.status, 401);
  const spoofedLocalInbox = await fetch(`${baseUrl}/api/local-admin/inbox`, {
    headers: { "x-trendradar-local-origin": "1" },
  });
  assert.equal(spoofedLocalInbox.status, 401);

  const headers = { "x-trendradar-admin-token": token };
  const authorizedInbox = await fetch(`${baseUrl}/api/local-admin/inbox`, { headers });
  assert.equal(authorizedInbox.status, 200);

  const interests = await fetch(`${baseUrl}/api/local-admin/interests`, { headers });
  assert.equal(interests.status, 200);
  assert.match((await interests.json()).content, /AI 产品/);

  const entities = await fetch(`${baseUrl}/api/local-admin/entities`);
  assert.equal(entities.status, 200);
  assert.equal((await entities.json()).snapshot.meta.entityCount, 0);
});

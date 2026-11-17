import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const component = () => readFile(path.join(webDir, "app/EntityRadar.tsx"), "utf8");
const adminServer = () => readFile(path.join(webDir, "scripts/local_admin_server.mjs"), "utf8");

test("B01: ⌘K hint removed and search box lives in the topbar", async () => {
  const source = await component();
  assert.doesNotMatch(source, /⌘\s*K/);
  const topbar = source.split('className="topbar"')[1].split("</header>")[0];
  assert.match(topbar, /search-box/);
  assert.doesNotMatch(source.replace(topbar, ""), /search-box/);
});

test("R01: settings popup hosts RSS 与热榜 and 兴趣设置", async () => {
  const source = await component();
  assert.match(source, /RSS 与热榜/);
});

test("R03: single save replaces the three-stage flow; DeepSeek UI removed", async () => {
  const source = await component();
  assert.doesNotMatch(source, /保存草稿/);
  assert.doesNotMatch(source, /检查并生效/);
  assert.doesNotMatch(source, /保存并立即运行/);
  assert.doesNotMatch(source, /deepseek-config|apiKeyInput/);
  assert.match(source, /按新规则筛选/);
});

test("R02/R03: 保存即生效、清空需确认、AI 凭据由 .env 提供", async () => {
  const source = await component();
  const admin = await adminServer();
  assert.doesNotMatch(source, /applyNow/);
  assert.match(source, /保存并立即生效/);
  assert.match(source, /正在保存配置…/);
  assert.match(source, /规则已保存，下一轮采集生效/);
  assert.doesNotMatch(source, /skipNotification: true/);
  assert.match(source, /清空兴趣设置/);
  assert.match(source, /确认清空/);
  assert.match(source, /AI_API_KEY/);
  assert.match(source, /request\("\/interests", \{ method: "DELETE" \}\)/);
  assert.match(admin, /req\.method === "DELETE" && url\.pathname === "\/api\/local-admin\/interests"/);
});

test("清空兴趣后立即关闭设置并重新判定 readiness，回到先配置页面", async () => {
  const source = await component();
  assert.match(source, /onCleared: \(\) => void/);
  assert.match(source, /onCleared\(\);/);
  assert.match(source, /onInterestsCleared/);
  assert.match(source, /onInterestsCleared=\{\(\) => \{ setSettingsOpen\(false\); loadReadiness\(\); \}\}/);
});

test("设置弹窗：页脚常驻、首次采集提示约一分钟", async () => {
  const source = await component();
  assert.match(source, /settings-scroll/);
  assert.match(source, /大约需要一分钟/);
});

test("R04: first-use guidance gate + readiness endpoint are wired", async () => {
  const source = await component();
  const admin = await adminServer();
  assert.match(admin, /api\/local-admin\/readiness/);
  assert.match(source, /首次使用/);
  assert.match(source, /开始采集与分析/);
  assert.match(source, /apiKeySet/);
});

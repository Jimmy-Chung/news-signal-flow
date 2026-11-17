import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(webDir, "..");

const component = () => readFile(path.join(webDir, "app/EntityRadar.tsx"), "utf8");
const adminServer = () => readFile(path.join(webDir, "scripts/local_admin_server.mjs"), "utf8");
const exporter = () => readFile(path.join(webDir, "scripts/export_data.py"), "utf8");
const loader = () => readFile(path.join(projectDir, "trendradar/core/loader.py"), "utf8");
const config = () => readFile(path.join(projectDir, "config/config.yaml"), "utf8");

test("保存兴趣只写规则，不触发采集；采集由定时任务负责", async () => {
  const source = await component();
  const interestBlock = source.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  assert.doesNotMatch(interestBlock, /actions\/run/);
  assert.doesNotMatch(interestBlock, /RUN_AND_MAY_PUSH/);
  assert.match(interestBlock, /下一轮采集会按新规则筛选/);
  assert.match(source, /setTimeout\(\(\) => setState\(null\), 2600\)/);
  assert.doesNotMatch(source, /onCollectionComplete/);
});

test("首次采集完成后刷新快照并展示结果", async () => {
  const source = await component();
  assert.match(source, /loadSnapshot\(\); loadReadiness\(\); \}, 800\)/);
  assert.match(source, /首次采集完成/);
});

test("服务端支持跳过推送；页面不绕过推送确认", async () => {
  const source = await component();
  const admin = await adminServer();
  const python = await loader();
  assert.match(admin, /TREND_RADAR_SKIP_NOTIFICATION/);
  assert.match(admin, /skipNotification: payload\.skipNotification === true/);
  assert.doesNotMatch(source.split("function InterestSettings")[1].split("function SettingsPanel")[0], /window\.confirm/);
  assert.match(python, /"ENABLE_NOTIFICATION": notification\.get\("enabled", True\)[\s\S]{0,120}TREND_RADAR_SKIP_NOTIFICATION/);
});

test("图谱只展示当前兴趣标签，兴趣变更会重分类已有新闻", async () => {
  const data = await exporter();
  const cfg = await config();
  assert.match(data, /AND t\.status = 'active'/);
  assert.match(cfg, /forward_only_updates: false/);
});

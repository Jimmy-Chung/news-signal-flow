import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startProductionServer() {
  const port = await reservePort();
  const child = spawn(
    process.execPath,
    [path.join(webDir, "node_modules/vinext/dist/cli.js"), "start", "--port", String(port)],
    { cwd: webDir, env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler-test.log" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  const url = `http://127.0.0.1:${port}/entities`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`生产服务器提前退出：${child.exitCode}\n${output}`);
    try {
      const response = await fetch(url, { headers: { accept: "text/html" } });
      return { child, response };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  child.kill("SIGTERM");
  throw new Error(`生产服务器启动超时\n${output}`);
}

test("server-renders the TrendRadar event workspace", async (context) => {
  const { child, response } = await startProductionServer();
  context.after(() => child.kill("SIGTERM"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>热点观测台 · News Signal Flow<\/title>/i);
  assert.match(html, /正在读取最新观测快照/);
  assert.doesNotMatch(html, /观察规则 · 实体优先|不再生成“AI 行业”节点/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);

  const component = await readFile(new URL("../app/EntityRadar.tsx", import.meta.url), "utf8");
  assert.match(component, /新增进展和来源扩散/);
  assert.match(component, /优先按新闻发布时间组织/);
  assert.doesNotMatch(component, /不看抽象行业|关系来自证据|速度可以播放/);
  assert.doesNotMatch(component, /SignalMethodology|signal-method-title/);
  assert.match(component, /aria-label={`解释\$\{label\}`}/);
  assert.match(component, /过去 24 小时滚动关注度/);
  assert.match(component, /语义去重后的具体进展数量/);
  assert.match(component, /首次加入该节点报道的独立来源数量/);
  assert.match(component, /原文没有发布时间时，才回退到 TrendRadar 首次采集时间/);
  assert.match(component, /从区间起点播放/);
  assert.match(component, /type="range"/);
  assert.match(component, /type="date"/);
  assert.match(component, /播放日期区间/);
  assert.match(component, /关注度变化/);
  assert.doesNotMatch(component, /日变化/);
  assert.match(component, /上一时间片大小/);
  assert.match(component, /关注度升降/);
  assert.match(component, /requestAnimationFrame\(animate\)/);
  assert.match(component, /关注度 \$\{hovered\.previousStrength\} → \$\{hovered\.strength\}/);
  assert.match(component, /displayClock\(snapshot\.meta\.latestCrawl\)/);
  assert.match(component, /displayClock\(item\.observedAt\)/);
  assert.match(component, /兴趣设置/);
  assert.match(component, /user_interests\.txt/);
  assert.match(component, /正在保存配置…/);
  assert.match(component, /清空兴趣设置/);
  assert.doesNotMatch(component, /保存草稿|检查并生效|保存并立即运行/);
  assert.doesNotMatch(component, /重新生成页面|startAction\("export"\)/);
  assert.match(component, /buildInterestDiff/);
  assert.match(component, /上次保存与本次内容差异/);
  assert.match(component, /上次保存/);
  assert.match(component, /本次内容/);
  assert.match(component, /复制提示词到 AI 工具/);
  assert.match(component, /buildInterestPrompt/);
  assert.match(component, /模板 · 示例/);
  assert.match(component, /addedInterestLines/);
  assert.match(component, /removedInterestLines/);
  const interestBlock = component.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  // 保存兴趣只写规则并校验配置；采集由定时任务负责，下一轮才用新规则。
  assert.doesNotMatch(interestBlock, /actions\/run/);
  assert.match(interestBlock, /actions\/deploy/);
  assert.match(component, /下一轮采集生效/);
  assert.match(component, /fetch\("\/api\/local-admin\/entities"/);
  assert.doesNotMatch(component, /setInterval\(refreshSnapshot/);
  assert.doesNotMatch(component, /EntityTimeline|view === "timeline"|setView\("timeline"\)/);
  assert.match(component, /0\.5×/);
  assert.match(component, /按节点类型着色/);
  assert.match(component, /useState\(false\).*colorByType|colorByType.*useState\(false\)/s);
  assert.match(component, /colorByType \? entity\.color : "#E8E8E8"/);
  assert.match(component, /a\.r \+ b\.r \+ 34/);
  assert.match(component, /拖拽节点调整位置/);
  assert.match(component, /setPointerCapture/);
  assert.match(component, /pinnedPositionsRef/);
  assert.match(component, /suppressClickRef/);
  assert.match(component, /tabIndex=\{onStepFrame \? 0 : undefined\}/);
  assert.match(component, /event\.key === "ArrowLeft"/);
  assert.match(component, /event\.key === "ArrowRight"/);
  assert.match(component, /点选图谱后 ← → 切换时间/);
  assert.match(component, /onStepFrame=\{stepFrame\}/);
  assert.match(component, /scrollIntoView/);
  assert.match(component, /该时段进展/);
  assert.match(component, /截至该时间/);
  assert.match(component, /已滑动到这个时间片对应的进展/);
  assert.match(component, /focusedEventRef/);
  assert.doesNotMatch(component, /onSelect=\{\(entity\) => \{\s*setPlaying\(false\)/);
  assert.match(component, /href="\/entities"/);
  assert.match(component, /href="\/graph"/);
  assert.doesNotMatch(component, /href="\/interests"/);
  assert.match(component, /href="\/inbox"/);
  assert.match(component, /收进 Inbox/);
  assert.match(component, /<span>摘要<\/span>/);
  assert.match(component, /compactDateTime/);
  assert.match(component, /标记完成/);
  assert.match(component, /恢复待办/);
  assert.match(component, /彻底移除/);
  assert.match(component, /onRemove/);
  assert.match(component, /completedAt/);
  assert.doesNotMatch(component, /setView\(/);

  const adminServer = await readFile(new URL("../scripts/local_admin_server.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /family=Doto/);
  assert.match(styles, /Space\+Grotesk/);
  assert.match(styles, /Space\+Mono/);
  assert.match(styles, /--black: #000000/);
  assert.match(styles, /--accent: #d71921/);
  assert.match(styles, /font-family: "Doto"/);
  assert.doesNotMatch(styles, /Nothing-inspired OLED instrument system[\s\S]*box-shadow: 0 14px 34px/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /data\/entities\.json|snapshot=/);
  assert.match(adminServer, /runtimeSnapshotPath/);
  assert.doesNotMatch(adminServer, /bundledSnapshotPath|app\/data\/entities\.json/);
  assert.match(adminServer, /scripts\/run-trendradar-local\.sh/);
  assert.match(adminServer, /ensureCollectorIdle/);
  assert.match(adminServer, /addInboxItem/);
  assert.match(adminServer, /setInboxItemCompleted/);
  assert.match(adminServer, /removeInboxItem/);
  assert.match(adminServer, /Application Support\/TrendRadar\/inbox\.json/);

  const inboxPage = await readFile(new URL("../app/inbox/page.tsx", import.meta.url), "utf8");
  assert.match(inboxPage, /view="inbox"/);

  const exporter = await readFile(new URL("../scripts/export_entity_data.py", import.meta.url), "utf8");
  assert.match(exporter, /"focus": focus/);
  assert.match(exporter, /"inFrame": focus_in_frame/);
});

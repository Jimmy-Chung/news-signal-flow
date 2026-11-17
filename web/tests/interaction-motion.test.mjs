import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const component = () => readFile(path.join(webDir, "app/EntityRadar.tsx"), "utf8");
const styles = () => readFile(path.join(webDir, "app/globals.css"), "utf8");
const adminServer = () => readFile(path.join(webDir, "scripts/local_admin_server.mjs"), "utf8");

test("按钮波纹：以点击坐标为圆心，450ms 放大到 2.4 倍并淡出", async () => {
  const source = await component();
  const css = await styles();
  assert.match(source, /useButtonRipple/);
  assert.match(source, /closest\("button"\)/);
  assert.match(source, /--ripple-x/);
  assert.match(source, /--ripple-y/);
  assert.match(source, /--ripple-size/);
  assert.match(source, /data-ripple", "run"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(css, /button\[data-ripple="run"\]::after/);
  assert.match(css, /@keyframes ui-ripple/);
  assert.match(css, /450ms/);
  assert.match(css, /scale\(2\.4\)/);
  assert.match(css, /opacity: \.28/);
});

test("复选框：0.8 弹性放大填充主题色，对勾 300ms 描边", async () => {
  const css = await styles();
  assert.match(css, /input\[type="checkbox"\][\s\S]*?appearance: none/);
  assert.match(css, /@keyframes checkbox-pop/);
  assert.match(css, /scale\(\.8\)/);
  assert.match(css, /background: var\(--accent\)/);
  assert.match(css, /@keyframes check-draw/);
  assert.match(css, /check-draw 300ms/);
  assert.match(css, /clip-path: inset\(0 100% 0 0\)/);
  // 对勾沿 y 轴镜像：短臂（宽）小于长臂（高），否则看起来是反勾。
  const mark = css.split('input[type="checkbox"]::after')[1].split("}")[0];
  assert.match(mark, /width: 5px/);
  assert.match(mark, /height: 9px/);
  assert.match(css, /\.inbox-list > li\.completed h2[\s\S]*?line-through/);
});

test("兴趣面板不再内嵌 DeepSeek 对话与密钥配置", async () => {
  const source = await component();
  const panel = source.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  assert.doesNotMatch(panel, /deepseek-config|class="interest-chat"|apiKeyInput|verifyDeepSeek|saveDeepSeek/);
  assert.match(panel, /user_interests\.txt/);
});

test("模板、复制提示词按钮与保存前预览都在面板内", async () => {
  const source = await component();
  const panel = source.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  assert.match(source, /const INTEREST_TEMPLATE = `感兴趣的：/);
  assert.match(source, /必须抓取的：/);
  assert.match(source, /不感兴趣的：/);
  assert.match(panel, /模板 · 示例/);
  assert.match(panel, /复制提示词到 AI 工具/);
  assert.match(panel, /navigator\.clipboard\.writeText/);
  assert.match(panel, /buildInterestPrompt/);
  assert.match(panel, /上次保存/);
  assert.match(panel, /本次内容/);
});

test("设置分区标题层级：标题在前，副标题在后", async () => {
  const source = await component();
  const head = source.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  assert.match(head, /<h2>兴趣设置<\/h2><span className="kicker">先让 AI 帮你写清楚，再粘贴回来保存<\/span>/);
});

test("保存进度条：分阶段推进、完成后保留成功态", async () => {
  const source = await component();
  const css = await styles();
  assert.match(source, /function useSaveProgress\(\)/);
  assert.match(source, /phase: "saving"/);
  assert.match(source, /phase: "deploying"/);
  assert.match(source, /phase: "done"/);
  assert.match(source, /正在保存配置…/);
  assert.match(source, /正在同步到运行副本…/);
  // 部署阶段没有真实百分比，按秒计时避免看起来卡死。
  assert.match(source, /elapsed}s/);
  // 兴趣设置与 RSS 两个保存入口都渲染进度条。
  assert.equal(source.match(/<SaveProgressBar state=\{saveState\} elapsed=\{saveElapsed\} \/>/g)?.length, 2);
  const interestSave = source.split("function InterestSettings")[1].split("function SettingsPanel")[0];
  assert.match(interestSave, /beginSave\(\);[\s\S]{0,400}?request\("\/interests"/);
  assert.match(interestSave, /stageSave\(\);/);
  assert.match(css, /\.save-progress-track i/);
  assert.match(css, /\.save-progress\[data-phase="done"\] \.save-progress-track i \{ background: var\(--success\)/);
  assert.match(css, /\.save-progress\[data-phase="error"\] \.save-progress-track i \{ background: var\(--accent\)/);
});

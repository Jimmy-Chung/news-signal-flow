import http from "node:http";
import crypto from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addInboxItem, listInboxItems, removeInboxItem, setInboxItemCompleted } from "../lib/inbox_store.mjs";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(process.env.TREND_RADAR_PROJECT_DIR || path.resolve(webDir, ".."));
const configDir = path.resolve(process.env.TREND_RADAR_CONFIG_DIR || path.join(projectDir, "config"));
const runtimeDir = path.resolve(process.env.TREND_RADAR_RUNTIME_DIR || path.join(os.homedir(), "Library/Application Support/TrendRadar/runtime"));
const dataDir = path.resolve(process.env.TREND_RADAR_DATA_DIR || path.join(runtimeDir, "output"));
const interestsPath = path.join(configDir, "custom/ai/user_interests.txt");
const runtimeSnapshotPath = path.join(dataDir, "web/entities.json");
const inboxPath = process.env.TREND_RADAR_INBOX_PATH
  || (process.env.TREND_RADAR_DATA_DIR
    ? path.join(dataDir, "inbox.json")
    : path.join(os.homedir(), "Library/Application Support/TrendRadar/inbox.json"));
const serviceName = "TrendRadar Web Admin Token";
const accountName = process.env.USER || "trendradar";
const adminPort = Number(process.env.TREND_RADAR_ADMIN_PORT || "3003");
const directDeployment = process.env.TREND_RADAR_DEPLOY_MODE === "direct";
const trustLocalOrigin = process.env.TREND_RADAR_TRUST_LOCAL_ORIGIN === "true";
const publicInbox = process.env.TREND_RADAR_INBOX_PUBLIC === "true";
const jobs = new Map();
let activeJobId = null;

function keychainToken() {
  if (process.platform !== "darwin") {
    throw new Error("服务器部署必须设置 TREND_RADAR_ADMIN_TOKEN");
  }
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-a", accountName, "-s", serviceName, "-w"], { encoding: "utf8" }).trim();
  } catch {
    const token = crypto.randomBytes(24).toString("base64url");
    execFileSync("/usr/bin/security", ["add-generic-password", "-U", "-a", accountName, "-s", serviceName, "-w", token]);
    return token;
  }
}

const adminToken = process.env.TREND_RADAR_ADMIN_TOKEN || keychainToken();

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function authorized(req) {
  if (trustLocalOrigin && req.headers["x-trendradar-local-origin"] === "1") return true;
  const supplied = String(req.headers["x-trendradar-admin-token"] || "");
  if (!supplied || supplied.length !== adminToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(adminToken));
}

function appendLog(job, value) {
  job.log = `${job.log}${value}`.slice(-24000);
  job.updatedAt = new Date().toISOString();
}

function runCommand(job, command, args, cwd = projectDir) {
  return new Promise((resolve, reject) => {
    appendLog(job, `\n$ ${[command, ...args].join(" ")}\n`);
    const child = spawn(command, args, { cwd, env: { ...process.env, PYTHONUNBUFFERED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => appendLog(job, chunk.toString()));
    child.stderr.on("data", (chunk) => appendLog(job, chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`命令执行失败（退出码 ${code ?? "unknown"}）`)));
  });
}

async function ensureCollectorIdle() {
  try {
    const pid = Number((await fs.readFile(path.join(dataDir, "meta/collector.lock/pid"), "utf8")).trim());
    if (pid > 0) {
      process.kill(pid, 0);
      throw new Error(`系统采集任务正在运行（PID ${pid}），请等待完成后再立即运行`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("系统采集任务正在运行")) throw error;
  }
}

function startJob(kind) {
  if (activeJobId) throw new Error("已有任务正在执行，请等待完成");
  const id = crypto.randomUUID();
  const job = { id, kind, status: "running", log: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  jobs.set(id, job);
  activeJobId = id;
  const work = async () => {
    if (directDeployment && kind === "deploy") {
      await runCommand(job, "scripts/run-trendradar.sh", ["--doctor"]);
      await runCommand(job, "scripts/run-trendradar.sh", ["--show-schedule"]);
    } else if (directDeployment && kind === "export") {
      await runCommand(job, "scripts/update-web-entity-snapshot.sh", []);
    } else if (directDeployment && kind === "run") {
      await ensureCollectorIdle();
      await runCommand(job, "scripts/run-trendradar.sh", ["--doctor"]);
      await runCommand(job, "scripts/run-trendradar.sh", ["--show-schedule"]);
      await runCommand(job, "scripts/run-trendradar.sh", []);
    } else if (kind === "deploy") {
      await runCommand(job, "scripts/run-trendradar-local.sh", ["--doctor"]);
      await runCommand(job, "scripts/run-trendradar-local.sh", ["--show-schedule"]);
      await runCommand(job, "scripts/deploy-local-runtime.sh", []);
    } else if (kind === "export") {
      await runCommand(job, path.join(runtimeDir, "scripts/update-web-entity-snapshot.sh"), [], runtimeDir);
    } else if (kind === "run") {
      await ensureCollectorIdle();
      await runCommand(job, "scripts/run-trendradar-local.sh", ["--doctor"]);
      await runCommand(job, "scripts/run-trendradar-local.sh", ["--show-schedule"]);
      await runCommand(job, "scripts/deploy-local-runtime.sh", []);
      await runCommand(job, path.join(runtimeDir, "scripts/run-trendradar-local.sh"), [], runtimeDir);
    }
  };
  work().then(() => {
    job.status = "completed";
    appendLog(job, "\n任务完成。\n");
  }).catch((error) => {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    appendLog(job, `\n${job.error}\n`);
  }).finally(() => { activeJobId = null; });
  return job;
}

async function saveInterests(content) {
  if (typeof content !== "string" || content.length < 40 || content.length > 50000) throw new Error("兴趣配置内容无效");
  for (const heading of ["必须提醒", "感兴趣", "明确不要"]) {
    if (!content.includes(heading)) throw new Error(`缺少“${heading}”配置段`);
  }
  const tempPath = `${interestsPath}.tmp`;
  await fs.writeFile(tempPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  await fs.rename(tempPath, interestsPath);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (url.pathname === "/api/local-admin/status") {
      return json(res, 200, { available: true, authenticated: authorized(req), authRequired: !(trustLocalOrigin && req.headers["x-trendradar-local-origin"] === "1"), activeJobId });
    }
    if (req.method === "GET" && url.pathname === "/api/local-admin/entities") {
      try {
        const content = await fs.readFile(runtimeSnapshotPath, "utf8");
        const stat = await fs.stat(runtimeSnapshotPath);
        return json(res, 200, { snapshot: JSON.parse(content), updatedAt: stat.mtime.toISOString() });
      } catch (error) {
        if (error?.code === "ENOENT") return json(res, 503, { error: "实体快照尚未生成，请先完成一次采集或节点分析" });
        throw error;
      }
    }

    if (url.pathname.startsWith("/api/local-admin/inbox") && !publicInbox && !authorized(req)) {
      return json(res, 401, { error: "Inbox 需要管理口令" });
    }

    // Local preview can opt into a public Inbox. Server deployments default
    // to token-protected writes and reads.
    if (req.method === "GET" && url.pathname === "/api/local-admin/inbox") {
      const items = await listInboxItems(inboxPath);
      return json(res, 200, {
        items,
        pendingCount: items.filter((item) => !item.completedAt).length,
        completedCount: items.filter((item) => Boolean(item.completedAt)).length,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/local-admin/inbox") {
      const result = await addInboxItem(inboxPath, await body(req));
      return json(res, result.created ? 201 : 200, result);
    }
    const inboxItemMatch = url.pathname.match(/^\/api\/local-admin\/inbox\/([^/]+)$/);
    if (req.method === "PATCH" && inboxItemMatch) {
      const payload = await body(req);
      if (typeof payload.completed !== "boolean") return json(res, 400, { error: "completed 必须是布尔值" });
      const item = await setInboxItemCompleted(inboxPath, decodeURIComponent(inboxItemMatch[1]), payload.completed);
      return item ? json(res, 200, { item }) : json(res, 404, { error: "Inbox 记录不存在" });
    }
    if (req.method === "DELETE" && inboxItemMatch) {
      const item = await removeInboxItem(inboxPath, decodeURIComponent(inboxItemMatch[1]));
      return item ? json(res, 200, { item }) : json(res, 404, { error: "Inbox 记录不存在" });
    }

    if (!url.pathname.startsWith("/api/local-admin/") || !authorized(req)) return json(res, 401, { error: "需要本机访问或管理口令" });

    if (req.method === "GET" && url.pathname === "/api/local-admin/interests") {
      const content = await fs.readFile(interestsPath, "utf8");
      const stat = await fs.stat(interestsPath);
      return json(res, 200, { content, updatedAt: stat.mtime.toISOString(), path: "config/custom/ai/user_interests.txt" });
    }
    if (req.method === "POST" && url.pathname === "/api/local-admin/interests") {
      const payload = await body(req);
      await saveInterests(payload.content);
      return json(res, 200, { saved: true, updatedAt: new Date().toISOString() });
    }
    if (req.method === "POST" && url.pathname === "/api/local-admin/interests/suggest") {
      const payload = await body(req);
      const output = await new Promise((resolve, reject) => {
        const command = process.env.TREND_RADAR_PYTHON || process.env.TREND_RADAR_UV_BIN || "uv";
        const args = process.env.TREND_RADAR_PYTHON
          ? ["web/scripts/suggest_interests.py"]
          : ["run", "python", "web/scripts/suggest_interests.py"];
        const child = spawn(command, args, { cwd: projectDir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `LLM 配置助手失败（${code}）`)));
        child.stdin.end(JSON.stringify({ instruction: payload.instruction, current: payload.current }));
      });
      return json(res, 200, JSON.parse(output));
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/local-admin/actions/")) {
      const kind = url.pathname.split("/").pop();
      if (!["deploy", "export", "run"].includes(kind)) return json(res, 404, { error: "未知操作" });
      const payload = await body(req);
      if (kind === "run" && payload.confirm !== "RUN_AND_MAY_PUSH") return json(res, 400, { error: "立即运行可能发送飞书消息，需要明确确认" });
      return json(res, 202, startJob(kind));
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/local-admin/jobs/")) {
      const job = jobs.get(url.pathname.split("/").pop());
      return job ? json(res, 200, job) : json(res, 404, { error: "任务不存在或服务已重启" });
    }
    return json(res, 404, { error: "接口不存在" });
  } catch (error) {
    return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(adminPort, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : adminPort;
  console.log(`TrendRadar local admin listening on http://127.0.0.1:${port}`);
});

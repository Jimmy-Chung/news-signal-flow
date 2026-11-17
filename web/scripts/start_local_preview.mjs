import { spawn, fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.resolve(webDir, "..");
const port = process.env.TREND_RADAR_WEB_PORT || "3002";
const runtimeDir = process.env.TREND_RADAR_RUNTIME_DIR || path.join(process.env.HOME, "Library/Application Support/TrendRadar/runtime");
const previewEnv = {
  ...process.env,
  TREND_RADAR_PROJECT_DIR: process.env.TREND_RADAR_PROJECT_DIR || projectDir,
  TREND_RADAR_CONFIG_DIR: process.env.TREND_RADAR_CONFIG_DIR || path.join(projectDir, "config"),
  TREND_RADAR_RUNTIME_DIR: runtimeDir,
  TREND_RADAR_DATA_DIR: process.env.TREND_RADAR_DATA_DIR || path.join(runtimeDir, "output"),
  TREND_RADAR_TRUST_LOCAL_ORIGIN: process.env.TREND_RADAR_TRUST_LOCAL_ORIGIN || "true",
  TREND_RADAR_INBOX_PUBLIC: process.env.TREND_RADAR_INBOX_PUBLIC || "false",
};
let stopping = false;
let webProcess;

const adminProcess = fork(path.join(webDir, "scripts/local_admin_server.mjs"), [], {
  cwd: webDir,
  env: previewEnv,
  stdio: ["inherit", "inherit", "inherit", "ipc"],
});

function startWeb() {
  webProcess = spawn("npm", ["run", "start", "--", "--port", port], {
    cwd: webDir,
    env: previewEnv,
    stdio: "inherit",
  });
  webProcess.on("exit", (code) => {
    if (!stopping && code !== 0) {
      console.error(`Web preview exited with code ${code ?? "unknown"}`);
    }
  });
}

async function restartWeb() {
  if (!webProcess || webProcess.exitCode !== null) {
    startWeb();
    return;
  }
  webProcess.kill("SIGTERM");
  await new Promise((resolve) => webProcess.once("exit", resolve));
  startWeb();
}

adminProcess.on("message", (message) => {
  if (message?.type === "restart-web") restartWeb();
});

function shutdown() {
  if (stopping) return;
  stopping = true;
  webProcess?.kill("SIGTERM");
  adminProcess.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
adminProcess.on("exit", (code) => {
  if (!stopping) {
    console.error(`Local admin service exited with code ${code ?? "unknown"}`);
    shutdown();
  }
});

startWeb();

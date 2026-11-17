import { promises as fs } from "node:fs";

/** 读取 .env 为键值对象；文件不存在时返回空对象。 */
export async function readEnvFile(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const values = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key) values[key] = value;
    }
    return values;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

/** 原子更新 .env 中的若干键，保留其他行与注释。 */
export async function setEnvVars(filePath, updates) {
  const remaining = { ...updates };
  const lines = [];
  try {
    const text = await fs.readFile(filePath, "utf8");
    for (const raw of text.split("\n")) {
      if (raw.trim() && !raw.trim().startsWith("#") && raw.includes("=")) {
        const eq = raw.indexOf("=");
        const key = raw.slice(0, eq).trim();
        if (key in remaining) {
          lines.push(`${key}=${remaining[key]}`);
          delete remaining[key];
          continue;
        }
      }
      lines.push(raw);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const [key, value] of Object.entries(remaining)) {
    lines.push(`${key}=${value}`);
  }
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
  await fs.rename(tempPath, filePath);
}

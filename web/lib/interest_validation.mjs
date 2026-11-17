// 新版模板使用「感兴趣 / 必须抓取 / 不感兴趣」，旧文件的三段式仍然接受。
const HEADING_SETS = [
  ["感兴趣的", "必须抓取的", "不感兴趣的"],
  ["必须提醒", "感兴趣", "明确不要"],
];
const PLACEHOLDER_MARKERS = [
  "你必须收到的品牌、人物、产品或事件",
  "希望 AI 按语义判断的主题、事件类型和关注角度",
  "广告、招聘、标题党或其他明确排除的内容",
];

function normalizedHeading(line) {
  return line.trim().replace(/^#{1,6}\s*/, "").replace(/^[-*]\s*/, "").replace(/[：:]\s*$/, "").trim();
}

function hasHeading(content, heading) {
  return content.split(/\r?\n/).some((line) => normalizedHeading(line) === heading);
}

/**
 * 校验 user_interests.txt 的内容是否“合法”。
 * 合法 = 任意一套三段式齐全 + 非空 + 非示例模板占位内容。
 * 返回 { ok: true } 或 { ok: false, error: string }。
 */
export function validateInterestContent(content) {
  if (typeof content !== "string" || content.trim().length < 40) {
    return { ok: false, error: "兴趣配置内容无效（过短）" };
  }
  if (content.length > 50000) {
    return { ok: false, error: "兴趣配置内容无效（过长）" };
  }
  // 选匹配最多的一套标题，缺哪个就报哪个，避免新旧格式互相干扰。
  let best = HEADING_SETS[0];
  let bestMissing = HEADING_SETS[0];
  for (const headings of HEADING_SETS) {
    const missing = headings.filter((heading) => !hasHeading(content, heading));
    if (missing.length < bestMissing.length) {
      best = headings;
      bestMissing = missing;
    }
  }
  if (bestMissing.length > 0) {
    return { ok: false, error: `缺少“${bestMissing[0]}”配置段（需要：${best.join(" / ")}）` };
  }
  if (PLACEHOLDER_MARKERS.every((marker) => content.includes(marker))) {
    return { ok: false, error: "兴趣配置仍是示例模板，请先描述你的真实兴趣" };
  }
  return { ok: true };
}

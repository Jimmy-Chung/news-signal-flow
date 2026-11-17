import assert from "node:assert/strict";
import test from "node:test";
import { validateInterestContent } from "../lib/interest_validation.mjs";

const VALID = "必须提醒：\n- Kimi 与月之暗面\n\n感兴趣：\n- AI 编程工具\n\n明确不要：\n- 广告\n";

const PLACEHOLDER = `# 个人兴趣规则示例
# 首次使用时复制为 user_interests.txt，再按自己的需求修改。

必须提醒：
- 你必须收到的品牌、人物、产品或事件

感兴趣：
- 希望 AI 按语义判断的主题、事件类型和关注角度

明确不要：
- 广告、招聘、标题党或其他明确排除的内容
`;

test("validateInterestContent accepts a valid three-section interest file", () => {
  assert.equal(validateInterestContent(VALID).ok, true);
});

test("rejects content missing a required heading", () => {
  const missing = "必须提醒：\n- Kimi 与月之暗面\n- 英伟达\n\n感兴趣：\n- AI 编程工具\n- 开源大模型\n";
  const result = validateInterestContent(missing);
  assert.equal(result.ok, false);
  assert.match(result.error, /明确不要/);
});

test("rejects blank/too-short content", () => {
  assert.equal(validateInterestContent("").ok, false);
  assert.equal(validateInterestContent("必须提醒：感兴趣：明确不要：").ok, false);
});

test("rejects the untouched example template", () => {
  const result = validateInterestContent(PLACEHOLDER);
  assert.equal(result.ok, false);
  assert.match(result.error, /示例模板/);
});

const NEW_VALID = "感兴趣的：\n- 英伟达、AMD 的财报与新芯片\n\n必须抓取的：\n- 美国对华 AI 芯片出口限制\n\n不感兴趣的：\n- 娱乐八卦与广告\n";

test("accepts the new 感兴趣 / 必须抓取 / 不感兴趣 template", () => {
  const result = validateInterestContent(NEW_VALID);
  assert.equal(result.ok, true);
});

test("reports the missing heading for the new template", () => {
  const missing = "感兴趣的：\n- 英伟达、AMD 的财报与新芯片\n\n必须抓取的：\n- 美国对华 AI 芯片出口限制\n";
  const result = validateInterestContent(missing);
  assert.equal(result.ok, false);
  assert.match(result.error, /不感兴趣的/);
});

#!/usr/bin/env python3
"""Use the configured TrendRadar provider to edit the existing interests file."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

from trendradar.ai.client import AIClient


def keychain(service: str) -> str:
    if sys.platform != "darwin" or not os.path.exists("/usr/bin/security"):
        return ""
    result = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-a", os.environ.get("USER", ""), "-s", service, "-w"],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def configured_secret(environment_name: str, keychain_service: str, default: str = "") -> str:
    """Prefer portable environment configuration, then macOS Keychain."""
    return os.environ.get(environment_name, "").strip() or keychain(keychain_service) or default


def clean_response(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^```(?:text|markdown)?\s*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*```$", "", value)
    start = value.find("# TrendRadar")
    return value[start:].strip() if start >= 0 else value


payload = json.load(sys.stdin)
instruction = str(payload.get("instruction", "")).strip()
current = str(payload.get("current", "")).strip()
if not instruction or not current:
    raise SystemExit("缺少修改要求或当前配置")

client = AIClient({
    "MODEL": configured_secret("AI_MODEL", "TrendRadar AI Model", "deepseek/deepseek-v4-flash"),
    "API_KEY": configured_secret("AI_API_KEY", "TrendRadar AI API Key"),
    "API_BASE": configured_secret("AI_API_BASE", "TrendRadar AI API Base"),
    "TEMPERATURE": 0.1,
    "MAX_TOKENS": 5000,
})
valid, error = client.validate_config()
if not valid:
    raise SystemExit(error)

system = """你是 TrendRadar 兴趣配置编辑助手。用户会提供当前 user_interests.txt 和修改要求。
请返回修改后的完整文件，保留三段结构：必须提醒、感兴趣、明确不要。
只修改用户明确要求涉及的内容，保留其他既有规则、注释和自选股列表。
不要添加 API Key、Webhook、Token、密码或不存在的事实。
输出必须从“# TrendRadar 个人兴趣规则”开始，只输出完整纯文本文件，不要解释，不要使用 Markdown 代码围栏。"""
result = clean_response(client.chat([
    {"role": "system", "content": system},
    {"role": "user", "content": f"修改要求：\n{instruction}\n\n当前文件：\n{current}"},
]))
for heading in ("必须提醒", "感兴趣", "明确不要"):
    if heading not in result:
        raise SystemExit(f"模型返回内容缺少“{heading}”配置段")

print(json.dumps({"content": result + "\n", "summary": "已按你的要求生成修改草案，请检查差异后再保存。"}, ensure_ascii=False))

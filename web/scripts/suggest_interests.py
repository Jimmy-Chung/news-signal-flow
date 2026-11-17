#!/usr/bin/env python3
"""Use the configured TrendRadar provider to edit the existing interests file."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

from trendradar.ai.client import AIClient

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / ".env"


def load_dotenv() -> dict:
    values = {}
    if not ENV_PATH.exists():
        return values
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values


DOTENV_VALUES = load_dotenv()


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
    """Prefer environment, then project .env, then macOS Keychain."""
    return (
        os.environ.get(environment_name, "").strip()
        or DOTENV_VALUES.get(environment_name, "").strip()
        or keychain(keychain_service)
        or default
    )


def clean_response(value: str) -> str:
    value = value.strip()
    value = re.sub(r"^```(?:text|markdown)?\s*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*```$", "", value)
    start = value.find("# TrendRadar")
    return value[start:].strip() if start >= 0 else value


payload = json.load(sys.stdin)
messages = payload.get("messages") or []
current = str(payload.get("current", "")).strip()
if not messages and not current:
    raise SystemExit("缺少对话或当前配置")

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

system = """你是 TrendRadar 兴趣配置编辑助手。用户通过多轮对话修改 user_interests.txt。
请返回修改后的完整文件，保留三段结构：必须提醒、感兴趣、明确不要。
只修改对话中明确要求的内容，保留其他既有规则、注释和自选股列表。
不要添加 API Key、Webhook、Token、密码或不存在的事实。
输出必须从“# TrendRadar 个人兴趣规则”开始，只输出完整纯文本文件，不要解释，不要使用 Markdown 代码围栏。"""

conversation = [{"role": "system", "content": system}]
for message in messages:
    role = message.get("role") if isinstance(message, dict) else "user"
    content = str(message.get("content", "")) if isinstance(message, dict) else str(message)
    if role in ("user", "assistant") and content.strip():
        conversation.append({"role": role, "content": content})
if current:
    conversation.append({"role": "user", "content": f"当前已保存的 user_interests.txt 基线（对话中未要求修改的部分保持不动）：\n{current}"})

result = clean_response(client.chat(conversation))
for heading in ("必须提醒", "感兴趣", "明确不要"):
    if heading not in result:
        raise SystemExit(f"模型返回内容缺少“{heading}”配置段")

print(json.dumps({"content": result + "\n", "summary": "已按对话生成完整规则，请确认差异后再保存。"}, ensure_ascii=False))

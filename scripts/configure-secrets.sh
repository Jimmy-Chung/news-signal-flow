#!/bin/zsh
set -euo pipefail

ACCOUNT="${USER}"

echo "TrendRadar 安全凭证配置"
echo "凭证将写入 macOS 钥匙串，不会保存到项目文件或终端历史。"
echo

echo "1/3 请输入飞书自定义机器人的 Webhook URL："
/usr/bin/security add-generic-password \
  -U -a "${ACCOUNT}" -s "TrendRadar Feishu Webhook" -w

echo
echo "2/3 请输入用于 AI 兴趣筛选的 API Key："
/usr/bin/security add-generic-password \
  -U -a "${ACCOUNT}" -s "TrendRadar AI API Key" -w

echo
echo "3/3 请输入 LiteLLM 模型名。"
echo "项目默认值：deepseek/deepseek-v4-flash"
read "MODEL?模型名（直接回车使用默认值）: "
MODEL="${MODEL:-deepseek/deepseek-v4-flash}"
/usr/bin/security add-generic-password \
  -U -a "${ACCOUNT}" -s "TrendRadar AI Model" -w "${MODEL}"

echo
echo "配置完成。接下来可运行："
echo "  scripts/run-trendradar-local.sh --doctor"
echo "  scripts/run-trendradar-local.sh --test-notification"


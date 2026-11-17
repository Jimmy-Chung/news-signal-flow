# NewsSignal Flow

从新闻中发现变化，追踪你关心的人与事。

NewsSignal Flow 是一个可以自行部署的新闻信号观察工具。它采集热榜和 RSS，按你的兴趣进行 AI 筛选，再把相关报道整理到公司、产品、人物、技术、政策等具体对象下，展示它们的进展、关注度与传播变化。

同一件事可能被十家媒体反复报道，也可能只有一家媒体披露了新进展。NewsSignal Flow 把“事情发生了什么变化”和“报道扩散到了哪里”分开呈现，帮助你从重复新闻中找到值得持续关注的信号。

## 可以用它做什么

- **按兴趣筛选新闻**：用自然语言描述必须提醒、感兴趣和明确不要的内容。
- **观察具体对象**：把不同报道汇集到同一个公司、产品或人物，查看相关进展和原始来源。
- **区分进展与传播**：分别观察关注度、新进展数量和新增报道来源。
- **回看信号变化**：选择日期范围，按每 3 小时的时间片播放图谱，观察关注度的增强与减弱。
- **保存稍后阅读的内容**：将新闻收进 Inbox，保留进展摘要和原文链接，并标记完成或恢复待办。
- **接收新闻推送**：可选配置飞书等通知渠道，将匹配的新闻推送给你。

### 页面与图谱

| 页面 | 用途 |
| --- | --- |
| 概览 | 查看关注对象、相关报道和最近变化 |
| 关系图谱 | 查看哪些对象在报道中共同出现，并按时间回放 |
| 兴趣设置 | 用自然语言生成规则草案，确认后保存并应用 |
| Inbox | 保存新闻、阅读原文、管理待办与已完成记录 |

图谱中，**节点代表具体对象**，连线表示它们在报道中共同出现。节点大小表示过去 24 小时的综合关注度；黄色实线外环表示当前 3 小时内的新进展；蓝色虚线外环表示当前 3 小时内首次加入该对象报道的来源数量。

关注度是综合指标，新增来源也不代表出现了新的进展。连线不直接代表合作、竞争或因果关系。

<!-- 待补充当前版本实际截图：概览、图谱回放。发布前检查截图中没有个人兴趣、Inbox 内容、口令或本机路径。 -->

## 部署

可部署在自己的服务器，也可以直接在本地运行。模型 API 需要单独配置；AI 兴趣筛选和新闻分析会产生模型调用费用。

### 服务器部署：Docker Compose

准备一台能够访问新闻源和模型 API 的 Linux 服务器，安装 Docker 与 Docker Compose。使用自定义域名访问时，将域名解析到服务器，并开放 TCP 80、443 端口。Compose 中的 Caddy 负责 HTTPS。

下载本项目代码，进入仓库根目录后执行：

```bash
git clone https://github.com/Jimmy-Chung/news-signal-flow.git
cd news-signal-flow
cp docker/.env.full.example docker/.env.full
```

编辑 `docker/.env.full`，至少配置：

| 变量 | 说明 |
| --- | --- |
| `TREND_RADAR_DOMAIN` | 你的访问域名，例如 `news.example.com` |
| `TREND_RADAR_ADMIN_TOKEN` | 自己生成的随机管理口令，用于兴趣设置和 Inbox 等操作 |
| `AI_API_KEY` | 模型服务的 API Key |
| `AI_MODEL` | 模型名称，使用 `provider/model` 格式，例如 `deepseek/deepseek-chat` |
| `AI_API_BASE` | 可选，自定义模型 API 地址 |
| `FEISHU_WEBHOOK_URL` | 可选，飞书机器人 Webhook；不需要推送时留空 |

可用 `openssl rand -hex 32` 生成管理口令。不要使用示例文件里的占位值，也不要提交填写后的环境文件。

初始化兴趣文件：

```bash
bash scripts/initialize-user-config.sh
```

编辑 `config/custom/ai/user_interests.txt`，写入自己的兴趣，格式见下方“设置关注内容”。需要关键词回退时，同时编辑 `config/custom/keyword/user_must_notify.txt`。

构建并启动：

```bash
docker compose --env-file docker/.env.full -f docker/docker-compose.full.yml up -d --build
```

服务启动后，执行首次采集和分析：

```bash
docker compose --env-file docker/.env.full -f docker/docker-compose.full.yml exec trendradar-full /app/scripts/run-trendradar.sh
```

打开 `https://你的域名`。首次采集、兴趣筛选和图谱分析需要时间，完成后刷新页面即可看到结果。没有匹配新闻时，页面可能仍没有可展示的对象。

默认每 30 分钟采集一次。采集成功后自动更新图谱；配置了通知渠道时，也可能发送消息。调度频率可通过 `CRON_SCHEDULE` 调整。环境变量修改后，重新执行启动命令以更新容器。

常用管理命令：

```bash
# 查看运行日志
docker compose --env-file docker/.env.full -f docker/docker-compose.full.yml logs -f --tail=100 trendradar-full

# 停止服务
docker compose --env-file docker/.env.full -f docker/docker-compose.full.yml down
```

### 本地运行：macOS / Linux

需要 Python 3.12+、uv、Node.js 22.13+ 和 npm。以下命令在 Bash 或 Zsh 中执行，从仓库根目录开始。

安装 Python 依赖并创建本地兴趣文件：

```bash
uv sync --locked
bash scripts/initialize-user-config.sh
```

编辑 `config/custom/ai/user_interests.txt`，然后在当前终端配置运行目录和模型。将示例值替换为自己的配置：

```bash
export TREND_RADAR_PROJECT_DIR="$PWD"
export TREND_RADAR_CONFIG_DIR="$PWD/config"
export TREND_RADAR_DATA_DIR="$PWD/output"
export TREND_RADAR_DEPLOY_MODE=direct
export TREND_RADAR_ADMIN_TOKEN="$(openssl rand -hex 32)"

export AI_API_KEY="填写你的 API Key"
export AI_MODEL="deepseek/deepseek-chat"
# 使用自定义模型地址时再设置：
# export AI_API_BASE="https://你的模型服务地址"
```

检查配置并执行首次采集：

```bash
bash scripts/run-trendradar.sh --doctor
bash scripts/run-trendradar.sh --show-schedule
bash scripts/run-trendradar.sh
```

在同一个终端中构建并启动 Web：

```bash
cd web
npm ci
npm run build
npm run preview:local
```

打开 [http://localhost:3002](http://localhost:3002)。上述方式直接使用项目的 `config/` 和 `output/`，不需要额外的 macOS 运行副本。

本地启动命令不会自动创建定时采集任务。可以在仓库根目录再次执行 `bash scripts/run-trendradar.sh`，或自行接入 cron / 系统任务；关闭 Web 不会删除已采集的数据。

macOS 现有用户也可以继续使用钥匙串与 `scripts/run-trendradar-local.sh`，以及原有的运行副本和后台任务。环境变量优先于钥匙串配置。

## 怎么使用

### 1. 设置关注内容

在页面的“兴趣设置”中描述想增加、删除或调整的内容，生成草案并检查差异，再保存应用。也可以直接编辑 `config/custom/ai/user_interests.txt`：

```text
必须提醒：
- 我关注的产品有新版本发布或价格调整

感兴趣：
- 开源工具的重大更新，以及开发者实际使用这些工具的案例
- 新技术从研究走向产品的具体进展

明确不要：
- 广告、招聘和没有新增信息的重复评论
```

“必须提醒”和“明确不要”是给模型的筛选要求，模型判断可能有误。当前一次采集选择 AI 或关键词一种筛选方式；关键词规则在 AI 筛选失败时作为回退。Web 图谱读取 AI 筛选结果，使用图谱请保留 `config/config.yaml` 中的 AI 筛选模式。

保存规则只写入 `config/custom/ai/user_interests.txt` 并做配置校验，不会触发采集；规则在下一轮定时采集时生效。兴趣文件变更后，下一轮会做标签更新：新增的标签会让此前“未命中”的新闻重新过一遍筛选，改动较大时（默认阈值 0.6）会全量重分类；已命中的历史记录不会重算。

### 2. 看对象、进展与传播

在概览中搜索公司、产品、人物或具体进展，按类型筛选。打开对象详情，可以查看关注度走势、新闻进展和对应的原始报道。

在图谱中选择日期范围，播放、暂停或拖动时间轴。观察三个不同的问题：

- **关注度**：近期整体关注程度是在增强还是减弱？
- **新进展**：报道中是否出现了新的具体变化？
- **新增来源**：是否有更多来源开始关注这个对象？

页面在打开或刷新时读取最新结果，不会自动轮询。新一轮采集完成后，刷新浏览器即可查看。

### 3. 保存与阅读

在对象详情的新闻列表中点击“收进 Inbox”，保存新闻标题、进展摘要、来源和原文链接。在 Inbox 中可以打开原文、标记完成、恢复待办或移除记录。

Inbox 保存的是阅读清单，不是网页全文归档；原文仍通过链接访问。相同新闻链接会去重。

通过公网访问时，先在“兴趣设置”输入管理口令，当前浏览器会话中的 Inbox 操作也会使用该口令。本地直接访问默认免口令。图谱本身可公开浏览，个人部署需要限制阅读权限时，请在公网入口额外配置访问控制。

### 4. 调整采集范围和推送

| 想调整的内容 | 配置位置 |
| --- | --- |
| 热榜平台、RSS 订阅、AI 筛选阈值 | `config/config.yaml` |
| 自然语言兴趣 | `config/custom/ai/user_interests.txt` |
| 关键词与排除词回退规则 | `config/custom/keyword/user_must_notify.txt` |
| 不同时段的采集、增量推送和汇总策略 | `config/timeline.yaml` |
| Docker 的执行频率、模型密钥、通知凭证 | `docker/.env.full` |

通知渠道是可选的。服务器使用环境变量配置，本地 macOS 也支持钥匙串。关闭 Web 不影响已经配置好的独立采集任务和推送。

## 数据保存在哪里

Docker 部署和上面的本地直接运行方式默认使用仓库中的两个目录：

- `config/`：采集配置与个人兴趣规则。
- `output/`：新闻和 RSS 的 SQLite 数据库、图谱分析结果与缓存、HTML 报告，以及 Inbox 清单。

迁移或备份时保留这两个目录，凭证另外安全保存。图谱默认整理最近 9 天的数据；它的展示范围不等于数据库保存范围。使用自定义目录时，备份实际配置的路径。

AI 兴趣筛选和图谱分析会将新闻标题及相关上下文发送给你配置的模型服务，其中兴趣筛选包含你的偏好描述。密钥、个人规则、数据库、缓存与 Inbox 不应提交到公开仓库。

## 关于数据与来源

新闻进展由模型根据标题归纳，可能存在遗漏、误合并或误判，请通过原文核对。热榜通常没有可靠发布时间，系统会回退到首次采集时间，并在详情中标记。因此时间回放展示的是采集范围内可观察到的变化。

NewsSignal Flow 基于 [TrendRadar](https://github.com/sansan0/TrendRadar) 改造，保留其热榜、RSS 采集、兴趣筛选与通知能力，增加面向具体对象的新闻图谱、时间回放和 Inbox。热榜数据依赖上游接入的 [newsnow](https://github.com/ourongxing/newsnow) 服务，RSS 来自配置的订阅源。

项目沿用 **GPL-3.0**，完整条款见 [LICENSE](LICENSE)。上游原中文说明保留在 [README.upstream.md](README.upstream.md)，其中的界面、部署方式和功能说明以原项目为准。

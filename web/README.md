# TrendRadar Entity Radar

TrendRadar 的实体关系与变化观察页面。它读取本机运行副本中的每日 SQLite 数据库和现有 AI 筛选结果，生成实体快照，并展示：

- 具体实体的热度、事件变化和媒体扩散
- 可按日期区间播放的三小时关系图
- 实体详情、热度趋势、事件证据和原始来源
- 直接编辑现有 `user_interests.txt` 的 LLM 兴趣设置
- 从实体新闻侧栏收进 Inbox，在待办与已完成之间切换，并可彻底移除记录

## Local development

```bash
npm install
npm run export:entities  # 覆盖运行副本中的唯一 output/web/entities.json
npm run build
npm run preview:local
```

`npm run preview:local` 同时启动网页与本地管理桥接。页面只在首次打开或浏览器刷新时读取一次运行副本的 `output/web/entities.json`。系统半小时任务和页面“立即运行”都在采集成功后增量刷新该快照；已经打开的页面不会轮询，刷新浏览器即可读取新结果。“立即运行”会先同步配置并可能触发飞书推送，因此需要再次确认。外部 Tunnel 的兴趣配置、同步和立即运行等管理写操作需要 macOS 钥匙串中的 `TrendRadar Web Admin Token`；Inbox 的读取、新增和完成状态切换无需口令，本机 `localhost` 访问同样免口令。

Inbox 是用户数据，不属于可重建的实体快照。它原子写入 `~/Library/Application Support/TrendRadar/inbox.json`，保存 DeepSeek 事件总结、新闻原链接、实体节点名称与类别、加入时间和完成时间；相同新闻 URL 只保留一条，移除后可从实体侧栏再次收进。

## Validation

```bash
npm run build
npm test
npm run lint
```

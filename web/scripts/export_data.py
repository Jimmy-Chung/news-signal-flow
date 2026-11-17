#!/usr/bin/env python3
"""Export a read-only TrendRadar snapshot for the event-map prototype."""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path
from statistics import mean
from typing import Any


EVENT_RULES = [
    {
        "id": "deepseek-v4",
        "title": "DeepSeek V4 发布预期",
        "topic": "人工智能",
        "pattern": r"DeepSeek\s*V?4|深度求索",
        "summary": "围绕 DeepSeek 新一代模型的发布日期、能力预期与市场影响，讨论正在从爆料转向产品验证。",
        "entities": ["DeepSeek", "AI 模型"],
    },
    {
        "id": "kimi-k3",
        "title": "Kimi K3 与模型竞争",
        "topic": "人工智能",
        "pattern": r"Kimi\s*K?3|月之暗面|Moonshot",
        "summary": "Kimi K3 的发布、测评与行业影响形成连续讨论，并与模型竞争及科技股表现产生关联。",
        "entities": ["Kimi", "月之暗面", "AI 模型"],
    },
    {
        "id": "waic",
        "title": "WAIC：AI 从模型走向产业",
        "topic": "人工智能",
        "pattern": r"WAIC|世界人工智能大会|人工智能大会|人工智能合作组织",
        "summary": "大会信息从模型能力延伸到算力、机器人和产业合作，成为多个兴趣主题的共同交汇点。",
        "entities": ["WAIC", "AI 产业"],
    },
    {
        "id": "ai-infrastructure",
        "title": "国产 AI 算力与超节点",
        "topic": "AI基础设施",
        "pattern": r"超节点|算力|万卡|GPU|芯片|半导体|数据中心|CoreWeave",
        "summary": "国产算力、超节点与供应链成为产业关注焦点，信息集中在基础设施扩张和供给约束。",
        "entities": ["AI 算力", "半导体", "数据中心"],
    },
    {
        "id": "embodied-ai",
        "title": "人形机器人进入真实场景",
        "topic": "具身智能与机器人",
        "pattern": r"机器人|具身智能|人形|EngineAI|众擎|宇树|智元",
        "summary": "机器人内容从表演和赛事扩展到真实工作场景，产品能力与商业落地同时升温。",
        "entities": ["人形机器人", "具身智能"],
    },
    {
        "id": "openai-codex",
        "title": "OpenAI、Codex 与智能体生态",
        "topic": "AI编程工具",
        "pattern": r"OpenAI|ChatGPT|Codex|Anthropic|Claude|MCP|智能体|Agent",
        "summary": "模型、编程工具与智能体生态的产品更新被归并在同一观察节点，便于持续追踪能力变化。",
        "entities": ["OpenAI", "Codex", "Anthropic", "MCP"],
    },
    {
        "id": "trump",
        "title": "特朗普政策与市场外溢",
        "topic": "特朗普动态",
        "pattern": r"特朗普|Trump|白宫|美国总统",
        "summary": "特朗普相关动态持续跨越外交、贸易与市场议题，适合以时间线而非逐条通知追踪。",
        "entities": ["特朗普", "美国"],
    },
    {
        "id": "us-tech-market",
        "title": "美股科技板块快速轮动",
        "topic": "美股市场",
        "pattern": r"美股|纳指|标普|科技股|英伟达|NVIDIA|苹果|Apple|AMD|Palantir|CoreWeave|半导体",
        "summary": "科技股、半导体与 AI 交易出现密集信号，市场叙事在增长预期与风险提示之间快速切换。",
        "entities": ["美股", "科技股", "半导体"],
    },
    {
        "id": "changxin-memory",
        "title": "长鑫科技与存储供应链",
        "topic": "存储技术",
        "pattern": r"长鑫|内存|存储|海力士|Hynix|DRAM|NAND",
        "summary": "长鑫科技、内存供需和国产存储供应链形成同一事件簇，资本市场与产业信息相互强化。",
        "entities": ["长鑫科技", "存储", "内存"],
    },
    {
        "id": "gold",
        "title": "黄金与避险交易",
        "topic": "黄金市场",
        "pattern": r"黄金|金价|Gold|贵金属",
        "summary": "黄金相关消息围绕价格、避险需求与宏观预期展开，适合观察热度和叙事方向的变化。",
        "entities": ["黄金", "避险资产"],
    },
    {
        "id": "aerospace",
        "title": "商业航天与火箭进展",
        "topic": "航空航天",
        "pattern": r"航天|火箭|卫星|Rocket Lab|RKLB|SpaceX|航空",
        "summary": "商业航天、火箭和航空产业信息被汇总为持续事件，突出项目进展与商业化节点。",
        "entities": ["商业航天", "火箭", "航空"],
    },
    {
        "id": "new-energy-auto",
        "title": "新能源汽车竞争与出海",
        "topic": "新能源汽车",
        "pattern": r"比亚迪|BYD|特斯拉|Tesla|小米汽车|新能源汽车|电动车|汽车",
        "summary": "新能源汽车事件集中在竞争、出海、监管与产品表现，多个平台的报道可在一个节点内消化。",
        "entities": ["比亚迪", "特斯拉", "新能源汽车"],
    },
    {
        "id": "rare-earth",
        "title": "稀土与战略资源价格波动",
        "topic": "稀土与战略资源",
        "pattern": r"稀土|战略资源|工业维生素|矿产",
        "summary": "稀土和战略资源的价格、供给与政策变化被串成同一脉络，减少重复信息带来的注意力消耗。",
        "entities": ["稀土", "战略资源"],
    },
    {
        "id": "clean-energy",
        "title": "清洁能源与电力基础设施",
        "topic": "清洁能源",
        "pattern": r"清洁能源|新能源|电力|电网|核能|Oklo|NextEra|光伏|储能",
        "summary": "清洁能源、电力和新型基础设施信息被组织为长期观察节点，关注政策与商业进展。",
        "entities": ["清洁能源", "电力", "储能"],
    },
]


TOPIC_META = {
    "人工智能": {"color": "#6ee7b7", "short": "AI"},
    "AI基础设施": {"color": "#60a5fa", "short": "算力"},
    "AI编程工具": {"color": "#a78bfa", "short": "工具"},
    "具身智能与机器人": {"color": "#fbbf24", "short": "机器人"},
    "特朗普动态": {"color": "#fb7185", "short": "政策"},
    "美股市场": {"color": "#38bdf8", "short": "美股"},
    "存储技术": {"color": "#c084fc", "short": "存储"},
    "黄金市场": {"color": "#f59e0b", "short": "黄金"},
    "航空航天": {"color": "#22d3ee", "short": "航天"},
    "新能源汽车": {"color": "#4ade80", "short": "汽车"},
    "稀土与战略资源": {"color": "#f97316", "short": "资源"},
    "清洁能源": {"color": "#2dd4bf", "short": "能源"},
    "科技互联网": {"color": "#818cf8", "short": "科技"},
    "消费潮流": {"color": "#f472b6", "short": "消费"},
    "医疗健康": {"color": "#34d399", "short": "医疗"},
}

FALLBACK_TITLES = {
    "人工智能": "AI 行业综合动态",
    "AI动态": "AI 产品与行业动态",
    "黄金市场": "黄金市场综合动态",
    "具身智能与机器人": "机器人产业综合动态",
    "科技互联网": "科技互联网公司动态",
}


RELATIONS = [
    ("deepseek-v4", "us-tech-market", "影响市场叙事"),
    ("kimi-k3", "us-tech-market", "影响市场叙事"),
    ("waic", "embodied-ai", "展示与落地"),
    ("waic", "ai-infrastructure", "基础设施议题"),
    ("waic", "openai-codex", "生态扩展"),
    ("ai-infrastructure", "changxin-memory", "供应链关联"),
    ("trump", "gold", "避险情绪"),
    ("trump", "us-tech-market", "政策外溢"),
    ("rare-earth", "new-energy-auto", "上游供应链"),
    ("clean-energy", "ai-infrastructure", "电力需求"),
]


@dataclass
class Story:
    day: str
    source_type: str
    source: str
    title: str
    url: str
    score: float
    tags: set[str]
    best_rank: int | None
    rank_points: int
    first_seen: str | None
    last_seen: str | None
    published_at: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--days", type=int, default=9)
    return parser.parse_args()


def query(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return list(conn.execute(sql, params))


def load_day(news_db: Path, rss_db: Path | None, day: str) -> tuple[list[Story], dict[str, int]]:
    stories: dict[tuple[str, int], Story] = {}
    stats = {"news": 0, "rss": 0, "rankPoints": 0, "crawls": 0}
    with sqlite3.connect(news_db) as conn:
        stats["news"] = conn.execute("SELECT count(*) FROM news_items").fetchone()[0]
        stats["rankPoints"] = conn.execute("SELECT count(*) FROM rank_history").fetchone()[0]
        stats["crawls"] = conn.execute("SELECT count(*) FROM crawl_records").fetchone()[0]
        rows = query(
            conn,
            """
            SELECT r.news_item_id, r.source_type, r.relevance_score,
                   t.tag, n.title, n.platform_id, n.url,
                   n.first_crawl_time, n.last_crawl_time
            FROM ai_filter_results r
            JOIN ai_filter_tags t ON t.id = r.tag_id
            LEFT JOIN news_items n
              ON r.source_type = 'hotlist' AND n.id = r.news_item_id
            -- 图谱保留兴趣规则变更前已经产生的匹配结果。旧结果不会
            -- 参与后续推送，但仍属于当时已观测到的历史，应该可回放。
            WHERE r.relevance_score >= 0.7
            """,
        )
        rss_items: dict[int, sqlite3.Row] = {}
        if rss_db and rss_db.exists():
            with sqlite3.connect(rss_db) as rss_conn:
                stats["rss"] = rss_conn.execute("SELECT count(*) FROM rss_items").fetchone()[0]
                rss_items = {
                    int(row["id"]): row
                    for row in query(
                        rss_conn,
                        "SELECT id, title, feed_id, url, published_at, first_crawl_time, last_crawl_time FROM rss_items",
                    )
                }

        rank_cache: dict[int, tuple[int | None, int]] = {}
        for row in rows:
            item_id = int(row["news_item_id"])
            key = (row["source_type"], item_id)
            if row["source_type"] == "hotlist":
                title = row["title"]
                if not title:
                    continue
                source = row["platform_id"]
                url = row["url"] or ""
                first_seen = row["first_crawl_time"]
                last_seen = row["last_crawl_time"]
                published_at = None
                if item_id not in rank_cache:
                    best_rank, points = conn.execute(
                        "SELECT min(rank), count(*) FROM rank_history WHERE news_item_id = ?",
                        (item_id,),
                    ).fetchone()
                    rank_cache[item_id] = (best_rank, points)
                best_rank, rank_points = rank_cache[item_id]
            else:
                rss = rss_items.get(item_id)
                if not rss:
                    continue
                title = rss["title"]
                source = rss["feed_id"]
                url = rss["url"] or ""
                first_seen = rss["first_crawl_time"]
                last_seen = rss["last_crawl_time"]
                published_at = rss["published_at"]
                best_rank = None
                rank_points = 1

            if key not in stories:
                stories[key] = Story(
                    day=day,
                    source_type=row["source_type"],
                    source=source,
                    title=title,
                    url=url,
                    score=float(row["relevance_score"]),
                    tags={row["tag"]},
                    best_rank=best_rank,
                    rank_points=rank_points,
                    first_seen=first_seen,
                    last_seen=last_seen,
                    published_at=published_at,
                )
            else:
                stories[key].tags.add(row["tag"])
                stories[key].score = max(stories[key].score, float(row["relevance_score"]))
    return list(stories.values()), stats


def choose_event(story: Story) -> dict[str, Any]:
    for rule in EVENT_RULES:
        if re.search(rule["pattern"], story.title, flags=re.IGNORECASE):
            return rule
    primary = sorted(story.tags)[0] if story.tags else "其他关注"
    slug = re.sub(r"[^a-z0-9]+", "-", primary.lower()).strip("-") or f"topic-{abs(hash(primary)) % 100000}"
    return {
        "id": f"topic-{slug}",
        "title": FALLBACK_TITLES.get(primary, primary if primary.endswith("动态") else f"{primary}动态"),
        "topic": primary,
        "summary": f"将与“{primary}”相关的多源报道聚合为一个持续更新的观察节点，减少重复标题带来的打扰。",
        "entities": [primary],
    }


def iso_day(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def story_strength(stories: list[Story]) -> int:
    if not stories:
        return 0
    unique_titles = {re.sub(r"\s+", "", story.title).lower() for story in stories}
    source_count = len({story.source for story in stories})
    ranked = [story.best_rank for story in stories if story.best_rank is not None]
    prominence = mean(max(0.0, 1 - (rank - 1) / 50) for rank in ranked) if ranked else 0.16
    score = mean(story.score for story in stories)
    return min(
        100,
        round(math.log2(len(unique_titles) + 1) * 9 + source_count * 2.5 + prominence * 18 + score * 8),
    )


def comparable_time(story: Story, cutoff: str) -> bool:
    if not story.first_seen:
        return True
    value = story.first_seen.replace("-", ":")[-5:]
    return value <= cutoff.replace("-", ":")[-5:]


def title_novelty(current: list[Story], previous: list[Story]) -> tuple[int, int]:
    previous_titles = [re.sub(r"\s+", "", story.title).lower() for story in previous]
    novel = 0
    echo = 0
    seen: set[str] = set()
    for story in current:
        title = re.sub(r"\s+", "", story.title).lower()
        if title in seen:
            continue
        seen.add(title)
        similarity = max((SequenceMatcher(None, title, old).ratio() for old in previous_titles), default=0)
        if similarity < 0.48:
            novel += 1
        else:
            echo += 1
    return novel, echo


def build_event(
    rule: dict[str, Any],
    stories: list[Story],
    days: list[str],
    latest: str,
    latest_time: str,
) -> dict[str, Any]:
    by_day = Counter(s.day for s in stories)
    unique_urls = {s.url for s in stories if s.url}
    sources = Counter(s.source for s in stories)
    titles_seen: set[str] = set()
    distinct_stories: list[Story] = []
    for story in sorted(stories, key=lambda s: (s.day, s.score, -(s.best_rank or 999)), reverse=True):
        normalized = re.sub(r"\s+", "", story.title).lower()
        if normalized in titles_seen:
            continue
        titles_seen.add(normalized)
        distinct_stories.append(story)

    active_days = sorted(by_day)
    first_day, last_day = active_days[0], active_days[-1]
    latest_idx = days.index(latest)
    recent_days = set(days[max(0, latest_idx - 1) : latest_idx + 1])
    prior_days = set(days[max(0, latest_idx - 3) : max(0, latest_idx - 1)])
    recent = sum(by_day[d] for d in recent_days)
    prior = sum(by_day[d] for d in prior_days)
    if first_day == latest:
        status = "new"
    elif last_day < latest:
        status = "cooling"
    elif recent >= max(3, prior * 1.25):
        status = "rising"
    else:
        status = "developing"

    scores = [s.score for s in stories]
    ranks = [s.best_rank for s in stories if s.best_rank is not None]
    heat = min(
        99,
        round(18 + math.log2(len(distinct_stories) + 1) * 7 + len(sources) * 1.3 + mean(scores) * 12),
    )
    changes = []
    for day in reversed(active_days[-4:]):
        candidates = sorted(
            [s for s in distinct_stories if s.day == day],
            key=lambda s: (s.score, -(s.best_rank or 999)),
            reverse=True,
        )
        if candidates:
            top = candidates[0]
            changes.append(
                {
                    "date": day[5:].replace("-", "/"),
                    "title": top.title,
                    "source": top.source,
                    "kind": "新增线索" if day == first_day else "事件进展",
                }
            )

    top_stories = [
        {
            "title": s.title,
            "source": s.source,
            "url": s.url,
            "date": s.day[5:].replace("-", "/"),
            "score": round(s.score, 2),
            "rank": s.best_rank,
        }
        for s in distinct_stories[:8]
    ]

    previous_day = days[-2] if len(days) > 1 else latest
    current_window = [story for story in stories if story.day == latest]
    previous_window = [
        story for story in stories
        if story.day == previous_day and comparable_time(story, latest_time)
    ]
    current_strength = story_strength(current_window)
    previous_strength = story_strength(previous_window)
    momentum = current_strength - previous_strength
    momentum_pct = round(momentum / previous_strength * 100) if previous_strength else (100 if current_strength else 0)
    current_sources = {story.source for story in current_window}
    previous_sources = {story.source for story in previous_window}
    new_sources = sorted(current_sources - previous_sources)
    source_delta = len(current_sources) - len(previous_sources)
    current_ranks = [story.best_rank for story in current_window if story.best_rank is not None]
    previous_ranks = [story.best_rank for story in previous_window if story.best_rank is not None]
    current_best = min(current_ranks) if current_ranks else None
    previous_best = min(previous_ranks) if previous_ranks else None
    rank_gain = (previous_best - current_best) if current_best is not None and previous_best is not None else 0
    novel_titles, echo_titles = title_novelty(current_window, previous_window)
    novelty_rate = novel_titles / max(novel_titles + echo_titles, 1)

    if first_day == latest:
        signal_type = "new"
        signal_label = "新信号出现"
        signal_reason = f"今天首次出现，已有 {len(current_sources)} 个来源形成初始信号。"
    elif momentum >= 7 and source_delta > 0:
        signal_type = "amplifying"
        signal_label = "传播正在增强"
        signal_reason = (
            f"同类报道继续扩散，强度较昨日同期 +{momentum}；"
            f"新增 {len(new_sources)} 个来源。相似增量已被折叠，没有生成新的内容卡片。"
        )
    elif momentum >= 7 and novelty_rate >= 0.42:
        signal_type = "branching"
        signal_label = "叙事出现分叉"
        signal_reason = (
            f"强度较昨日同期 +{momentum}，其中 {novel_titles} 条线索引入了不同标题角度，"
            "不仅是重复报道。"
        )
    elif rank_gain >= 5 and current_strength >= previous_strength:
        signal_type = "accelerating"
        signal_label = "排名正在加速"
        signal_reason = f"最高排名较昨日同期提升 {rank_gain} 位，传播规模暂未明显扩张。"
    elif momentum <= -8:
        signal_type = "cooling"
        signal_label = "信号正在减弱"
        signal_reason = f"强度较昨日同期 {momentum}，来源数量变化 {source_delta:+d}。"
    else:
        signal_type = "steady"
        signal_label = "暂未发生显著变化"
        signal_reason = "事件仍在持续，但传播强度、来源广度和排名没有出现显著变化。"

    strength_timeline = []
    for day in days:
        day_stories = [story for story in stories if story.day == day]
        strength_timeline.append({"date": day[5:], "strength": story_strength(day_stories), "count": len(day_stories)})

    color = TOPIC_META.get(rule["topic"], {"color": "#94a3b8"})["color"]
    return {
        "id": rule["id"],
        "title": rule["title"],
        "topic": rule["topic"],
        "summary": rule["summary"],
        "entities": rule["entities"],
        "status": status,
        "attention": "important" if max(scores) >= 0.95 and recent >= 3 else "watch",
        "heat": heat,
        "strength": current_strength,
        "previousStrength": previous_strength,
        "momentum": momentum,
        "momentumPct": momentum_pct,
        "signalType": signal_type,
        "signalLabel": signal_label,
        "signalReason": signal_reason,
        "newSourceCount": len(new_sources),
        "sourceDelta": source_delta,
        "rankGain": rank_gain,
        "novelTitleCount": novel_titles,
        "echoTitleCount": echo_titles,
        "noveltyRate": round(novelty_rate, 2),
        "color": color,
        "firstSeen": first_day,
        "lastSeen": last_day,
        "spanDays": (iso_day(last_day) - iso_day(first_day)).days + 1,
        "storyCount": len(distinct_stories),
        "recordCount": len(stories),
        "sourceCount": len(sources),
        "uniqueUrlCount": len(unique_urls),
        "bestRank": min(ranks) if ranks else None,
        "avgScore": round(mean(scores), 2),
        "timeline": [{"date": d[5:], "count": by_day[d]} for d in days],
        "strengthTimeline": strength_timeline,
        "changes": changes,
        "stories": top_stories,
        "sources": [name for name, _ in sources.most_common(6)],
    }


def main() -> None:
    args = parse_args()
    news_dir = args.runtime_output / "news"
    rss_dir = args.runtime_output / "rss"
    dbs = sorted(news_dir.glob("????-??-??.db"))[-args.days :]
    if not dbs:
        raise SystemExit(f"No TrendRadar databases found in {news_dir}")

    days = [db.stem for db in dbs]
    latest = days[-1]
    all_stories: list[Story] = []
    totals = Counter()
    for news_db in dbs:
        rss_db = rss_dir / news_db.name
        stories, stats = load_day(news_db, rss_db if rss_db.exists() else None, news_db.stem)
        all_stories.extend(stories)
        totals.update(stats)

    grouped: dict[str, tuple[dict[str, Any], list[Story]]] = {}
    for story in all_stories:
        rule = choose_event(story)
        if rule["id"] not in grouped:
            grouped[rule["id"]] = (rule, [])
        grouped[rule["id"]][1].append(story)

    latest_time = ""
    with sqlite3.connect(dbs[-1]) as conn:
        latest_time = conn.execute("SELECT max(last_crawl_time) FROM news_items").fetchone()[0] or latest

    events = [
        build_event(rule, stories, days, latest, latest_time)
        for rule, stories in grouped.values()
        if len(stories) >= 2
    ]
    status_order = {"new": 0, "rising": 1, "developing": 2, "cooling": 3}
    events.sort(
        key=lambda e: (
            e["lastSeen"] != latest,
            0 if e["signalType"] in {"new", "amplifying", "branching", "accelerating"} else 1,
            -e["momentum"],
            status_order[e["status"]],
            -e["heat"],
            -e["storyCount"],
        )
    )
    events = events[:18]
    event_ids = {e["id"] for e in events}

    topic_counts = Counter(e["topic"] for e in events)
    topics = [
        {
            "id": f"topic:{topic}",
            "name": topic,
            "short": TOPIC_META.get(topic, {"short": topic[:2]})["short"],
            "color": TOPIC_META.get(topic, {"color": "#94a3b8"})["color"],
            "eventCount": count,
        }
        for topic, count in topic_counts.most_common()
    ]
    edges = [
        {"from": e["id"], "to": f"topic:{e['topic']}", "type": "belongs", "label": "属于"}
        for e in events
    ]
    edges.extend(
        {"from": source, "to": target, "type": "related", "label": label}
        for source, target, label in RELATIONS
        if source in event_ids and target in event_ids
    )

    payload = {
        "meta": {
            "scope": "filtered",
            "filterMode": "ai",
            "generatedAt": datetime.now().astimezone().isoformat(timespec="minutes"),
            "dataFrom": days[0],
            "dataTo": latest,
            "latestCrawl": latest_time,
            "days": days,
            "newsRecords": totals["news"],
            "rssRecords": totals["rss"],
            "rankPoints": totals["rankPoints"],
            "crawlRuns": totals["crawls"],
            "matchedRecords": len(all_stories),
            "eventCount": len(events),
            "topicCount": len(topics),
            "growingCount": sum(
                event["signalType"] in {"new", "amplifying", "branching", "accelerating"}
                for event in events
            ),
        },
        "topics": topics,
        "events": events,
        "edges": edges,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Exported {len(events)} events from {len(all_stories)} matched records "
        f"({days[0]} through {latest}) to {args.output}"
    )


if __name__ == "__main__":
    main()

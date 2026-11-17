#!/usr/bin/env python3
"""Export a broad TrendRadar snapshot without applying AI interest filtering."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import export_data as base


BROAD_TOPIC_META = {
    "国际与政治": {"color": "#fb7185", "short": "国际"},
    "体育": {"color": "#38bdf8", "short": "体育"},
    "社会": {"color": "#f97316", "short": "社会"},
    "财经": {"color": "#f59e0b", "short": "财经"},
    "AI与机器人": {"color": "#a78bfa", "short": "AI"},
    "科技": {"color": "#6ee7b7", "short": "科技"},
    "文娱": {"color": "#f472b6", "short": "文娱"},
    "游戏电竞": {"color": "#818cf8", "short": "电竞"},
    "天气灾害": {"color": "#22d3ee", "short": "灾害"},
    "健康": {"color": "#34d399", "short": "健康"},
    "汽车": {"color": "#4ade80", "short": "汽车"},
    "教育": {"color": "#60a5fa", "short": "教育"},
    "其他": {"color": "#94a3b8", "short": "其他"},
}
base.TOPIC_META.update(BROAD_TOPIC_META)


# These anchors identify concrete public events, not user interests. Everything else
# is clustered from title similarity below.
EVENT_ANCHORS = [
    {
        "id": "world-cup-england-france",
        "title": "世界杯：英格兰 6:4 法国",
        "topic": "体育",
        "pattern": r"英格兰.{0,10}法国|法国.{0,10}英格兰|姆巴佩.{0,12}(世界杯|纪录|季军)|世界杯.{0,12}季军",
        "summary": "英法季军赛及姆巴佩纪录在多个平台同步扩散；相似赛果报道只增强同一个事件节点。",
        "entities": ["世界杯", "英格兰", "法国", "姆巴佩"],
    },
    {
        "id": "us-iran-conflict",
        "title": "美伊冲突与中东局势",
        "topic": "国际与政治",
        "pattern": r"美伊|伊朗.{0,14}(美国|美军|以色列)|美国.{0,14}伊朗|美军.{0,14}(伊朗|中东)|中东.{0,12}(冲突|战争)",
        "summary": "军事行动、外交回应和市场影响被串成一个持续事件，用于观察局势是否升级以及叙事如何变化。",
        "entities": ["美国", "伊朗", "中东"],
    },
    {
        "id": "pengshui-landslide",
        "title": "重庆彭水山体崩塌",
        "topic": "天气灾害",
        "pattern": r"彭水|重庆.{0,10}(山体|崩塌|山崩)|山体崩塌",
        "summary": "灾害发生、救援和后续通报被合并为同一时间线，来源增加只改变节点强度。",
        "entities": ["重庆", "彭水", "山体崩塌"],
    },
    {
        "id": "exam-score-rumor",
        "title": "“估分 715、实分 299”事件",
        "topic": "社会",
        "pattern": r"估分.{0,8}715|查分.{0,8}299|715.{0,10}299",
        "summary": "网络传言、当事信息和警方回应被聚合，重点呈现事实状态是否发生变化。",
        "entities": ["高考", "估分", "警方回应"],
    },
    {
        "id": "ouyang-weimin-investigation",
        "title": "欧阳卫民被查",
        "topic": "财经",
        "pattern": r"欧阳卫民|国开行原行长",
        "summary": "同一人事调查在多家媒体的重复快讯被折叠为一个节点。",
        "entities": ["欧阳卫民", "国家开发银行"],
    },
    {
        "id": "netanyahu-arrest",
        "title": "纽约市长称将逮捕内塔尼亚胡",
        "topic": "国际与政治",
        "pattern": r"逮捕.{0,8}内塔尼亚胡|内塔尼亚胡.{0,10}逮捕",
        "summary": "围绕纽约市长相关表态的报道被合并，便于区分传播增强与后续事实进展。",
        "entities": ["纽约", "内塔尼亚胡"],
    },
    {
        "id": "waic-2026",
        "title": "世界人工智能大会（WAIC）",
        "topic": "AI与机器人",
        "pattern": r"WAIC|世界人工智能大会|人工智能合作组织",
        "summary": "大会发布、模型、算力和机器人展示被组织为一个持续节点，观察议题如何从会议信息向产业变化延伸。",
        "entities": ["WAIC", "人工智能"],
    },
    {
        "id": "kimi-k3",
        "title": "Kimi K3 发布与行业反馈",
        "topic": "AI与机器人",
        "pattern": r"Kimi\s*K?3|月之暗面|Moonshot",
        "summary": "发布、测评和市场反馈被折叠为一个产品事件，重复报道只增加强度。",
        "entities": ["Kimi", "月之暗面"],
    },
    {
        "id": "deepseek",
        "title": "DeepSeek 模型动态",
        "topic": "AI与机器人",
        "pattern": r"DeepSeek|深度求索",
        "summary": "围绕 DeepSeek 的产品、能力与产业影响被合并为一个持续观察节点。",
        "entities": ["DeepSeek", "AI 模型"],
    },
    {
        "id": "robot-fighting",
        "title": "人形机器人赛事与实战能力",
        "topic": "AI与机器人",
        "pattern": r"机器人.{0,10}(格斗|拳击|比赛|赛事)|机甲.{0,8}(格斗|比赛)",
        "summary": "机器人赛事、动作能力和产业展示被串联，用于观察内容热度是否转化为能力进展。",
        "entities": ["人形机器人", "机器人赛事"],
    },
    {
        "id": "moutai-price",
        "title": "茅台价格与渠道变化",
        "topic": "财经",
        "pattern": r"茅台.{0,12}(价格|涨价|批价|渠道)|飞天茅台",
        "summary": "价格、渠道和市场反应被聚合，避免同一轮价格波动产生多条提醒。",
        "entities": ["茅台", "白酒"],
    },
    {
        "id": "badge-formaldehyde",
        "title": "收藏徽章与甲醛中毒讨论",
        "topic": "健康",
        "pattern": r"吧唧.{0,12}(中毒|甲醛)|徽章.{0,12}甲醛|甲醛中毒",
        "summary": "病例描述、安全讨论和科普回应被合并，节点只有在来源或事实增加时才增强。",
        "entities": ["收藏徽章", "甲醛"],
    },
    {
        "id": "mislabeled-beef",
        "title": "牛肉制品标签与食品安全",
        "topic": "社会",
        "pattern": r"牛肉.{0,12}(造假|掺假|标签|成分)|假牛肉",
        "summary": "产品曝光、监管回应和检测信息被组织为一个食品安全事件。",
        "entities": ["牛肉制品", "食品安全"],
    },
]


TOPIC_PATTERNS = [
    ("天气灾害", r"地震|台风|暴雨|洪水|山火|崩塌|泥石流|高温|气象|灾害"),
    ("游戏电竞", r"电竞|游戏|选手|战队|LPL|王者荣耀|英雄联盟|Steam|SYG"),
    ("体育", r"世界杯|足球|篮球|乒乓|网球|羽毛球|联赛|决赛|夺冠|球队|球员|NBA|FIFA|姆巴佩|贝林厄姆|马龙|许昕|樊振东|阿根廷|英格兰|法国队"),
    ("AI与机器人", r"人工智能|AI|模型|机器人|DeepSeek|Kimi|算力|芯片|大模型"),
    ("汽车", r"汽车|车企|新能源车|电动车|特斯拉|比亚迪|小米SU7"),
    ("财经", r"股市|股票|基金|银行|金融|央行|价格|涨价|下跌|上市|茅台|黄金|债券"),
    ("国际与政治", r"美国|伊朗|以色列|俄罗斯|乌克兰|总统|首相|外交|战争|国会|特朗普"),
    ("教育", r"高考|中考|高校|大学|学生|招生|考试|录取"),
    ("健康", r"医院|医生|疾病|中毒|健康|感染|药品|医疗|患者"),
    ("文娱", r"电影|电视剧|演员|歌手|综艺|票房|明星|导演|演唱会"),
    ("科技", r"科技|手机|互联网|苹果|华为|软件|平台|卫星|航天|脑机接口|内存条"),
    ("社会", r"警方|通报|男子|女子|老人|儿童|网友|事件|调查|回应|老板|罚款|城市|规划"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--days", type=int, default=9)
    parser.add_argument("--limit", type=int, default=18)
    return parser.parse_args()


def load_raw_day(news_db: Path, rss_db: Path | None, day: str) -> tuple[list[base.Story], dict[str, int]]:
    stories: list[base.Story] = []
    stats = {"news": 0, "rss": 0, "rankPoints": 0, "crawls": 0}
    with sqlite3.connect(news_db) as conn:
        conn.row_factory = sqlite3.Row
        stats["news"] = conn.execute("SELECT count(*) FROM news_items").fetchone()[0]
        stats["rankPoints"] = conn.execute("SELECT count(*) FROM rank_history").fetchone()[0]
        stats["crawls"] = conn.execute("SELECT count(*) FROM crawl_records").fetchone()[0]
        rank_stats = {
            int(row[0]): (int(row[1]), int(row[2]))
            for row in conn.execute(
                "SELECT news_item_id, min(rank), count(*) FROM rank_history GROUP BY news_item_id"
            )
        }
        for row in conn.execute(
            "SELECT id, title, platform_id, rank, url, first_crawl_time, last_crawl_time, crawl_count FROM news_items"
        ):
            best_rank, rank_points = rank_stats.get(int(row["id"]), (int(row["rank"]), int(row["crawl_count"])))
            stories.append(
                base.Story(
                    day=day,
                    source_type="hotlist",
                    source=row["platform_id"],
                    title=row["title"],
                    url=row["url"] or "",
                    score=1.0,
                    tags=set(),
                    best_rank=best_rank,
                    rank_points=rank_points,
                    first_seen=row["first_crawl_time"],
                    last_seen=row["last_crawl_time"],
                    published_at=None,
                )
            )

    if rss_db and rss_db.exists():
        with sqlite3.connect(rss_db) as conn:
            conn.row_factory = sqlite3.Row
            stats["rss"] = conn.execute("SELECT count(*) FROM rss_items").fetchone()[0]
            for row in conn.execute(
                "SELECT title, feed_id, url, published_at, first_crawl_time, last_crawl_time FROM rss_items"
            ):
                stories.append(
                    base.Story(
                        day=day,
                        source_type="rss",
                        source=row["feed_id"],
                        title=row["title"],
                        url=row["url"] or "",
                        score=1.0,
                        tags=set(),
                        best_rank=None,
                        rank_points=1,
                        first_seen=row["first_crawl_time"],
                        last_seen=row["last_crawl_time"],
                        published_at=row["published_at"],
                    )
                )
    return stories, stats


def normalize_title(title: str) -> str:
    value = title.casefold()
    value = re.sub(r"[\s\u3000]+", "", value)
    value = re.sub(r"[·•丨｜|_—–\-:：,，。.!！?？、/\\()（）\[\]【】{}<>《》“”‘’\"']", "", value)
    value = re.sub(r"(最新|突发|热搜|官方回应|警方通报|媒体称|网传)$", "", value)
    return value


def title_features(title: str) -> set[str]:
    value = normalize_title(title)
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", value))
    latin = re.findall(r"[a-z0-9]+", value)
    features = {chinese[index : index + 2] for index in range(max(0, len(chinese) - 1))}
    features.update(f"w:{token}" for token in latin if len(token) > 1)
    features.update(f"n:{token}" for token in re.findall(r"\d+", value))
    return features


def titles_related(left: str, right: str, common: set[str] | None = None) -> bool:
    a, b = normalize_title(left), normalize_title(right)
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = sorted((a, b), key=len)
    if len(shorter) >= 8 and shorter in longer:
        return True
    fa, fb = title_features(a), title_features(b)
    if common:
        fa -= common
        fb -= common
    shared = len(fa & fb)
    if shared < 3:
        return False
    containment = shared / max(1, min(len(fa), len(fb)))
    union = shared / max(1, len(fa | fb))
    sequence = SequenceMatcher(None, a, b).ratio()
    return containment >= 0.62 or union >= 0.42 or (containment >= 0.46 and sequence >= 0.56)


def anchor_for(story: base.Story) -> dict[str, Any] | None:
    for anchor in EVENT_ANCHORS:
        if re.search(anchor["pattern"], story.title, flags=re.IGNORECASE):
            return anchor
    return None


def infer_topic(titles: list[str]) -> str:
    text = " ".join(titles)
    for topic, pattern in TOPIC_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return topic
    return "其他"


def canonical_story(stories: list[base.Story]) -> base.Story:
    return sorted(
        stories,
        key=lambda story: (
            story.best_rank is None,
            story.best_rank if story.best_rank is not None else 999,
            len(story.title),
        ),
    )[0]


def cluster_latest(stories: list[base.Story]) -> list[list[base.Story]]:
    unique: dict[tuple[str, str, str], base.Story] = {}
    for story in stories:
        unique[(story.source, normalize_title(story.title), story.url)] = story
    candidates = list(unique.values())

    document_frequency = Counter(feature for story in candidates for feature in title_features(story.title))
    common = {feature for feature, count in document_frequency.items() if count > 45}
    feature_index: dict[str, set[int]] = defaultdict(set)
    clusters: list[list[base.Story]] = []
    cluster_features: list[set[str]] = []

    candidates.sort(key=lambda story: (story.best_rank is None, story.best_rank or 999, story.title))
    for story in candidates:
        features = title_features(story.title) - common
        possible = Counter(
            cluster_id
            for feature in features
            for cluster_id in feature_index.get(feature, set())
        )
        matched: int | None = None
        for cluster_id, _ in possible.most_common(12):
            representatives = clusters[cluster_id][:4]
            if any(story.url and other.url == story.url for other in representatives) or any(
                titles_related(story.title, other.title, common) for other in representatives
            ):
                matched = cluster_id
                break
        if matched is None:
            matched = len(clusters)
            clusters.append([story])
            cluster_features.append(set(features))
        else:
            clusters[matched].append(story)
            cluster_features[matched].update(features)
        for feature in features:
            feature_index[feature].add(matched)
    return clusters


def generic_rule(cluster: list[base.Story]) -> dict[str, Any]:
    representative = canonical_story(cluster)
    topic = infer_topic([story.title for story in cluster])
    digest = hashlib.sha1(normalize_title(representative.title).encode("utf-8")).hexdigest()[:10]
    source_count = len({story.source for story in cluster})
    return {
        "id": f"raw-{digest}",
        "title": representative.title,
        "topic": topic,
        "summary": (
            f"这个节点由未经兴趣筛选的原始新闻自动聚类：当前已有 {source_count} 个来源出现相似报道。"
            "后续只有来源、排名或标题角度变化时，节点才会增强。"
        ),
        "entities": [topic],
    }


def expand_generic_cluster(
    seed: list[base.Story], all_stories: list[base.Story]
) -> list[base.Story]:
    representatives = sorted(seed, key=lambda story: (story.best_rank is None, story.best_rank or 999))[:5]
    urls = {story.url for story in seed if story.url}
    expanded: list[base.Story] = []
    for story in all_stories:
        if anchor_for(story):
            continue
        if (story.url and story.url in urls) or any(
            titles_related(story.title, representative.title) for representative in representatives
        ):
            expanded.append(story)
    return expanded


def main() -> None:
    args = parse_args()
    news_dir = args.runtime_output / "news"
    rss_dir = args.runtime_output / "rss"
    dbs = sorted(news_dir.glob("????-??-??.db"))[-args.days :]
    if not dbs:
        raise SystemExit(f"No TrendRadar databases found in {news_dir}")

    days = [db.stem for db in dbs]
    latest = days[-1]
    all_stories: list[base.Story] = []
    totals = Counter()
    for news_db in dbs:
        stories, stats = load_raw_day(news_db, rss_dir / news_db.name, news_db.stem)
        all_stories.extend(stories)
        totals.update(stats)

    with sqlite3.connect(dbs[-1]) as conn:
        latest_time = conn.execute("SELECT max(last_crawl_time) FROM news_items").fetchone()[0] or latest

    grouped: list[tuple[dict[str, Any], list[base.Story]]] = []
    for anchor in EVENT_ANCHORS:
        matching = [
            story
            for story in all_stories
            if re.search(anchor["pattern"], story.title, flags=re.IGNORECASE)
        ]
        if matching:
            grouped.append((anchor, matching))

    latest_unanchored = [
        story for story in all_stories if story.day == latest and anchor_for(story) is None
    ]
    for cluster in cluster_latest(latest_unanchored):
        source_count = len({story.source for story in cluster})
        if source_count < 2 and len(cluster) < 3:
            continue
        expanded = expand_generic_cluster(cluster, all_stories)
        if len(expanded) >= 2:
            grouped.append((generic_rule(cluster), expanded))

    events = [
        base.build_event(rule, stories, days, latest, latest_time)
        for rule, stories in grouped
        if len(stories) >= 2
    ]
    events.sort(
        key=lambda event: (
            event["lastSeen"] != latest,
            0 if event["signalType"] in {"new", "amplifying", "branching", "accelerating"} else 1,
            -event["momentum"],
            -event["sourceCount"],
            -event["heat"],
        )
    )
    events = events[: args.limit]

    topic_counts = Counter(event["topic"] for event in events)
    topics = [
        {
            "id": f"topic:{topic}",
            "name": topic,
            "short": BROAD_TOPIC_META.get(topic, {"short": topic[:2]})["short"],
            "color": BROAD_TOPIC_META.get(topic, {"color": "#94a3b8"})["color"],
            "eventCount": count,
        }
        for topic, count in topic_counts.most_common()
    ]
    edges = [
        {"from": event["id"], "to": f"topic:{event['topic']}", "type": "belongs", "label": "属于"}
        for event in events
    ]

    payload = {
        "meta": {
            "scope": "broad",
            "filterMode": "raw",
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
        f"Exported {len(events)} broad events from {len(all_stories)} raw records "
        f"({days[0]} through {latest}) to {args.output}"
    )


if __name__ == "__main__":
    main()

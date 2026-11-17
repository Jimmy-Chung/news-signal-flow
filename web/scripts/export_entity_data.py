#!/usr/bin/env python3
"""Build an entity-first snapshot from persisted LLM interest-filter results."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from itertools import combinations
from pathlib import Path
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(SCRIPT_DIR))

import export_data as filtered  # noqa: E402
from trendradar.ai.client import AIClient  # noqa: E402


ENTITY_COLORS = {
    "company": "#38bdf8",
    "product": "#6ee7b7",
    "person": "#fbbf24",
    "technology": "#a78bfa",
    "organization": "#fb7185",
    "asset": "#f59e0b",
    "place": "#22d3ee",
    "policy": "#f97316",
    "other": "#94a3b8",
}

GENERIC_ENTITIES = {
    "ai", "人工智能", "ai行业", "科技", "科技行业", "美股", "市场", "行业", "公司",
    "模型", "大模型", "产品", "投资者", "机器人", "智能体", "新闻", "中国", "美国",
}

# These aliases come from the user's configured interest/watchlist vocabulary.
# They normalize names; they do not decide whether a story is interesting.
KNOWN_ALIASES = {
    "apple": ("苹果", "company"), "苹果": ("苹果", "company"),
    "nvidia": ("英伟达", "company"), "英伟达": ("英伟达", "company"), "nvda": ("英伟达", "company"),
    "海力士": ("SK 海力士", "company"), "sk海力士": ("SK 海力士", "company"), "skhynix": ("SK 海力士", "company"),
    "google": ("谷歌", "company"), "alphabet": ("谷歌", "company"), "谷歌": ("谷歌", "company"),
    "xiaomi": ("小米", "company"), "小米": ("小米", "company"),
    "tesla": ("特斯拉", "company"), "特斯拉": ("特斯拉", "company"),
    "alibaba": ("阿里巴巴", "company"), "阿里巴巴": ("阿里巴巴", "company"),
    "tencent": ("腾讯", "company"), "腾讯": ("腾讯", "company"),
    "byd": ("比亚迪", "company"), "比亚迪": ("比亚迪", "company"),
    "kimi": ("Kimi", "product"), "月之暗面kimi": ("Kimi", "product"),
    "长鑫": ("长鑫科技", "company"), "长鑫科技": ("长鑫科技", "company"),
    "阿里": ("阿里巴巴", "company"),
    "waic": ("WAIC", "organization"), "世界人工智能大会": ("WAIC", "organization"),
    "霍尔木兹": ("霍尔木兹海峡", "place"), "霍尔木兹海峡": ("霍尔木兹海峡", "place"),
    "金价": ("黄金", "asset"), "黄金": ("黄金", "asset"),
    "油价": ("原油", "asset"), "国际油价": ("原油", "asset"), "原油": ("原油", "asset"),
    "ibm": ("IBM", "company"), "spacex": ("SpaceX", "company"),
    "deepseek": ("DeepSeek", "product"), "深度求索": ("DeepSeek", "company"),
    "openai": ("OpenAI", "company"), "anthropic": ("Anthropic", "company"),
    "claude": ("Claude", "product"), "codex": ("Codex", "product"),
}

TYPE_ALIASES = {
    "country": "place", "location": "place", "city": "place",
    "model": "product", "software": "product", "hardware": "product", "chip": "technology",
    "commodity": "asset", "stock": "asset", "currency": "asset",
    "institution": "organization", "government": "organization", "brand": "company",
}

EXTRACTION_SYSTEM = """你是新闻实体和事件抽取器。只依据标题中明确表达的信息，返回严格 JSON。

目标：把兴趣分类之后的新闻转换为具体实体和具体事件。兴趣分类词不是实体。

实体规则：
1. 只提取可持续追踪的具体对象：公司、组织、人物、产品/模型、具体技术、资产/商品、地点或政策。
2. 禁止输出“AI行业、人工智能、科技、美股、市场、行业、公司、模型、产品”等宽泛类别。
3. canonical_name 使用常见、简洁、稳定的名称，例如“Kimi”“Kimi K3”“月之暗面”“英伟达”“GPT-5”。
4. 公司和其产品不要合并，例如 OpenAI 与 GPT 是两个实体；Kimi 与月之暗面是两个实体。
5. 每条最多 5 个实体，不确定时宁缺毋滥。

事件规则：
1. event.name 必须是标题中发生的具体事情，例如“Kimi K3 正式发布”，不能是“AI行业动态”。
2. 只有观点、泛讨论或信息不足时，event 可以为 null。
3. change_type 只能是 release、update、pricing、performance、partnership、regulation、management、market_impact、rumor、response、incident、analysis、other。
4. 不要补充标题里没有的事实。

输出格式：
{"items":[{"id":1,"entities":[{"name":"Kimi","type":"product"}],"event":{"name":"Kimi K3 正式发布","type":"product_release","change_type":"release"},"confidence":0.93}]}
只输出 JSON。"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--days", type=int, default=9)
    parser.add_argument("--batch-size", type=int, default=25)
    return parser.parse_args()


def normalized_title(value: str) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", value.casefold())


def entity_key(value: str) -> str:
    return re.sub(r"[\s·•_—–\-:：/\\()（）]+", "", value.casefold())


def time_minutes(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(\d{2})[-:](\d{2})$", value)
    if not match:
        return None
    return int(match.group(1)) * 60 + int(match.group(2))


def display_time(value: str | None) -> str | None:
    if not value:
        return value
    return re.sub(r"^(\d{1,2})-(\d{2})$", r"\1:\2", value)


LOCAL_TZ = ZoneInfo("Asia/Shanghai")


def published_datetime(story: filtered.Story) -> datetime | None:
    """Return an RSS publication time in the product's local timezone.

    feedparser normalizes parsed feed dates to UTC but stores them without a
    timezone suffix, so naive RSS timestamps are treated as UTC here.
    """
    value = story.published_at
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(LOCAL_TZ)


def observed_datetime(story: filtered.Story) -> datetime:
    minutes = time_minutes(story.first_seen) or 0
    parsed = datetime.strptime(story.day, "%Y-%m-%d").replace(
        hour=minutes // 60,
        minute=minutes % 60,
        tzinfo=LOCAL_TZ,
    )
    return parsed


def effective_datetime(story: filtered.Story) -> tuple[datetime, str]:
    published = published_datetime(story)
    return (published, "published") if published else (observed_datetime(story), "observed")


def heat_streak(points: list[dict[str, Any]]) -> tuple[str, int]:
    values = [int(point["strength"]) for point in points]
    if len(values) < 2:
        return "stable", 0
    latest_delta = values[-1] - values[-2]
    if latest_delta == 0:
        return "stable", 0
    direction = 1 if latest_delta > 0 else -1
    streak = 0
    for index in range(len(values) - 1, 0, -1):
        delta = values[index] - values[index - 1]
        if delta == 0 or (1 if delta > 0 else -1) != direction:
            break
        streak += 1
    return ("rising" if direction > 0 else "falling"), streak


def parse_json_response(content: str) -> dict[str, Any]:
    cleaned = content.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end < start:
        raise ValueError("AI response did not contain a JSON object")
    return json.loads(cleaned[start : end + 1])


def load_cache(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "items": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("version") == 1 and isinstance(data.get("items"), dict):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return {"version": 1, "items": {}}


def save_cache(path: Path, cache: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(path)


def call_extractor(client: AIClient, rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    payload = "\n".join(
        f"[{row['id']}] 观测日期={row['day']} 标题={row['title']}" for row in rows
    )
    response = client.chat(
        [
            {"role": "system", "content": EXTRACTION_SYSTEM},
            {"role": "user", "content": payload},
        ],
        temperature=0.1,
        max_tokens=6500,
        response_format={"type": "json_object"},
    )
    parsed = parse_json_response(response)
    results: dict[int, dict[str, Any]] = {}
    for item in parsed.get("items", []):
        try:
            item_id = int(item["id"])
        except (KeyError, TypeError, ValueError):
            continue
        results[item_id] = item
    return results


def fallback_extraction(title: str) -> dict[str, Any]:
    """Conservative fallback: keep no invented entity when the provider omits a row."""
    return {"entities": [], "event": {"name": title, "type": "other", "change_type": "other"}, "confidence": 0.35}


def extract_all(
    client: AIClient,
    titles: list[dict[str, Any]],
    cache_path: Path,
    batch_size: int,
) -> dict[str, dict[str, Any]]:
    cache = load_cache(cache_path)
    cached_items: dict[str, Any] = cache["items"]
    pending = [row for row in titles if row["hash"] not in cached_items]
    if pending:
        print(f"Extracting entities and events for {len(pending)} uncached titles...")
    for offset in range(0, len(pending), batch_size):
        batch = pending[offset : offset + batch_size]
        numbered = [dict(row, id=index + 1) for index, row in enumerate(batch)]
        try:
            extracted = call_extractor(client, numbered)
        except Exception as exc:
            if len(batch) <= 8:
                raise
            print(f"Batch {offset // batch_size + 1} needs a smaller retry: {type(exc).__name__}")
            extracted = {}
            midpoint = len(batch) // 2
            for half in (batch[:midpoint], batch[midpoint:]):
                half_rows = [dict(row, id=index + 1) for index, row in enumerate(half)]
                half_result = call_extractor(client, half_rows)
                for index, row in enumerate(half, 1):
                    if index in half_result:
                        extracted[batch.index(row) + 1] = half_result[index]
        for index, row in enumerate(batch, 1):
            value = extracted.get(index, fallback_extraction(row["title"]))
            cached_items[row["hash"]] = {"title": row["title"], "result": value}
        cache["updatedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")
        save_cache(cache_path, cache)
        print(f"  cached {min(offset + len(batch), len(pending))}/{len(pending)}")
    return {key: value["result"] for key, value in cached_items.items()}


def load_interest_stories(runtime_output: Path, day_count: int) -> tuple[list[filtered.Story], list[str], Counter[str], str]:
    news_dir = runtime_output / "news"
    rss_dir = runtime_output / "rss"
    dbs = sorted(news_dir.glob("????-??-??.db"))[-day_count:]
    if not dbs:
        raise SystemExit(f"No TrendRadar databases found in {news_dir}")
    stories: list[filtered.Story] = []
    totals: Counter[str] = Counter()
    for news_db in dbs:
        day_stories, stats = filtered.load_day(news_db, rss_dir / news_db.name, news_db.stem)
        stories.extend(day_stories)
        totals.update(stats)
    with sqlite3.connect(dbs[-1]) as conn:
        latest_time = conn.execute("SELECT max(last_crawl_time) FROM news_items").fetchone()[0] or "23-59"
    return stories, [db.stem for db in dbs], totals, latest_time


def clean_entities(result: dict[str, Any]) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    seen: set[str] = set()
    for entity in result.get("entities", [])[:5]:
        if not isinstance(entity, dict):
            continue
        name = str(entity.get("name", "")).strip().strip("。.,，")
        key = entity_key(name)
        alias = KNOWN_ALIASES.get(key)
        if alias:
            name, forced_type = alias
            key = entity_key(name)
        else:
            forced_type = ""
        if not name or key in GENERIC_ENTITIES or key in seen or len(name) > 42:
            continue
        seen.add(key)
        entity_type = forced_type or str(entity.get("type", "other")).casefold()
        entity_type = TYPE_ALIASES.get(entity_type, entity_type)
        if entity_type not in ENTITY_COLORS:
            entity_type = "other"
        cleaned.append({"name": name, "key": key, "type": entity_type})
    return cleaned


def merge_entity_names(extractions: dict[str, dict[str, Any]]) -> dict[str, dict[str, str]]:
    candidates: dict[str, Counter[tuple[str, str]]] = defaultdict(Counter)
    for result in extractions.values():
        for entity in clean_entities(result):
            candidates[entity["key"]][(entity["name"], entity["type"])] += 1
    canonical: dict[str, dict[str, str]] = {}
    for key, values in candidates.items():
        (name, entity_type), _ = values.most_common(1)[0]
        canonical[key] = {"name": name, "type": entity_type}
    return canonical


def story_strength(stories: list[filtered.Story]) -> int:
    if not stories:
        return 0
    unique_titles = {normalized_title(story.title) for story in stories}
    sources = {story.source for story in stories}
    ranks = [story.best_rank for story in stories if story.best_rank is not None]
    prominence = mean(max(0.0, 1 - (rank - 1) / 50) for rank in ranks) if ranks else 0.16
    relevance = mean(story.score for story in stories)
    return min(100, round(math.log2(len(unique_titles) + 1) * 9 + len(sources) * 2.5 + prominence * 18 + relevance * 8))


def event_from_result(result: dict[str, Any], fallback_title: str) -> dict[str, str]:
    event = result.get("event")
    if not isinstance(event, dict):
        return {"name": fallback_title, "type": "other", "changeType": "other"}
    name = str(event.get("name") or fallback_title).strip()
    return {
        "name": name,
        "type": str(event.get("type") or "other"),
        "changeType": str(event.get("change_type") or "other"),
    }


def evidence_from_story(story: filtered.Story) -> dict[str, Any]:
    event_time, time_basis = effective_datetime(story)
    return {
        "title": story.title,
        "source": story.source,
        "url": story.url,
        "date": event_time.date().isoformat(),
        "time": event_time.strftime("%H:%M"),
        "timeBasis": time_basis,
        "publishedAt": event_time.isoformat(timespec="minutes") if time_basis == "published" else None,
        "observedDate": story.day,
        "observedAt": display_time(story.first_seen),
    }


def distinct_event_count(records: list[tuple[filtered.Story, dict[str, Any]]]) -> int:
    """Count concrete event changes after exact and near-duplicate grouping."""
    clusters: list[str] = []
    for story, result in records:
        name = normalized_title(event_from_result(result, story.title)["name"])
        if not name:
            continue
        if any(
            name == existing
            or (
                min(len(name), len(existing)) >= 7
                and SequenceMatcher(None, name, existing).ratio() >= 0.68
            )
            for existing in clusters
        ):
            continue
        clusters.append(name)
    return len(clusters)


def build_timeline(records: list[tuple[filtered.Story, dict[str, Any]]]) -> list[dict[str, Any]]:
    ordered = sorted(records, key=lambda pair: effective_datetime(pair[0])[0])
    groups: list[dict[str, Any]] = []
    for story, result in ordered:
        event_time, time_basis = effective_datetime(story)
        event = event_from_result(result, story.title)
        name_key = normalized_title(event["name"])
        matched: dict[str, Any] | None = None
        for group in reversed(groups[-12:]):
            similarity = SequenceMatcher(None, name_key, group["key"]).ratio()
            if name_key == group["key"] or (min(len(name_key), len(group["key"])) >= 7 and similarity >= 0.68):
                matched = group
                break
        evidence = evidence_from_story(story)
        if matched:
            matched["evidence"].append(evidence)
            matched["sources"].add(story.source)
            if event_time < matched["eventTime"]:
                matched["eventTime"] = event_time
                matched["date"] = event_time.date().isoformat()
                matched["time"] = event_time.strftime("%H:%M")
                matched["timeBasis"] = time_basis
                matched["publishedAt"] = evidence["publishedAt"]
                matched["observedDate"] = story.day
                matched["observedAt"] = display_time(story.first_seen)
        else:
            groups.append({
                "key": name_key,
                "name": event["name"],
                "type": event["type"],
                "changeType": event["changeType"],
                "eventTime": event_time,
                "date": event_time.date().isoformat(),
                "time": event_time.strftime("%H:%M"),
                "timeBasis": time_basis,
                "publishedAt": evidence["publishedAt"],
                "observedDate": story.day,
                "observedAt": display_time(story.first_seen),
                "sources": {story.source},
                "evidence": [evidence],
            })
    groups.sort(key=lambda group: group["eventTime"], reverse=True)
    return [
        {
            "id": hashlib.sha1(f"{group['name']}:{group['date']}".encode()).hexdigest()[:10],
            "name": group["name"],
            "type": group["type"],
            "changeType": group["changeType"],
            "date": group["date"],
            "time": group["time"],
            "timeBasis": group["timeBasis"],
            "publishedAt": group["publishedAt"],
            "observedDate": group["observedDate"],
            "observedAt": group["observedAt"],
            "sourceCount": len(group["sources"]),
            "evidenceCount": len(group["evidence"]),
            "evidence": group["evidence"][-4:],
        }
        for group in groups[:10]
    ]


def build_playback_frames(
    days: list[str],
    latest_time: str,
    entities: list[dict[str, Any]],
    story_mappings: list[tuple[filtered.Story, dict[str, Any], set[str], datetime, str]],
) -> list[dict[str, Any]]:
    visible = {entity["key"]: entity["id"] for entity in entities}
    cutoff = time_minutes(latest_time) or 1439
    snapshot_time = datetime.strptime(days[-1], "%Y-%m-%d").replace(
        hour=cutoff // 60,
        minute=cutoff % 60,
        tzinfo=LOCAL_TZ,
    )
    horizon = snapshot_time + timedelta(minutes=1)
    frame_start = datetime.strptime(days[0], "%Y-%m-%d").replace(tzinfo=LOCAL_TZ)

    entity_history: dict[str, list[tuple[filtered.Story, dict[str, Any], datetime]]] = defaultdict(list)
    source_first: dict[str, dict[str, datetime]] = defaultdict(dict)
    for story, result, keys, event_time, _ in story_mappings:
        for key in keys & visible.keys():
            entity_history[key].append((story, result, event_time))
            source_first[key][story.source] = min(source_first[key].get(story.source, event_time), event_time)

    frames: list[dict[str, Any]] = []
    while frame_start < horizon:
        frame_end = min(frame_start + timedelta(hours=3), horizon)
        rolling_start = frame_end - timedelta(hours=24)
        frame_stories = [
            (story, result, keys, event_time, basis)
            for story, result, keys, event_time, basis in story_mappings
            if frame_start <= event_time < frame_end
        ]
        rolling_stories = [
            (story, result, keys, event_time, basis)
            for story, result, keys, event_time, basis in story_mappings
            if rolling_start <= event_time < frame_end
        ]

        nodes = []
        for entity in entities:
            key = entity["key"]
            history = entity_history.get(key, [])
            current_window = [
                (story, result) for story, result, event_time in history
                if frame_start <= event_time < frame_end
            ]
            rolling_window = [
                story for story, _, event_time in history
                if rolling_start <= event_time < frame_end
            ]
            new_sources = sum(
                1 for first_time in source_first.get(key, {}).values()
                if frame_start <= first_time < frame_end
            )
            focus_candidates = [
                (story, result, event_time, True)
                for story, result, event_time in history
                if frame_start <= event_time < frame_end
            ]
            if not focus_candidates:
                focus_candidates = [
                    (story, result, event_time, False)
                    for story, result, event_time in history
                    if event_time < frame_end
                ]
            focus = None
            if focus_candidates:
                focus_story, focus_result, _, focus_in_frame = max(
                    focus_candidates,
                    key=lambda item: item[2],
                )
                focus = {
                    "inFrame": focus_in_frame,
                    "event": event_from_result(focus_result, focus_story.title),
                    "evidence": evidence_from_story(focus_story),
                }
            nodes.append({
                "id": entity["id"],
                "seen": any(event_time < frame_end for _, _, event_time in history),
                "strength": story_strength(rolling_window),
                "eventChanges": distinct_event_count(current_window),
                "newSources": new_sources,
                "storyCount": len({normalized_title(story.title) for story in rolling_window}),
                "sourceCount": len({story.source for story in rolling_window}),
                "focus": focus,
            })

        pair_counts: Counter[tuple[str, str]] = Counter()
        for _, _, keys, _, _ in rolling_stories:
            visible_keys = sorted(keys & visible.keys())
            for left, right in combinations(visible_keys, 2):
                pair_counts[(left, right)] += 1
        frame_edges = [
            {
                "from": visible[left],
                "to": visible[right],
                "weight": count,
                "type": "cooccurs",
                "label": f"过去 24 小时共同出现在 {count} 条线索中",
            }
            for (left, right), count in pair_counts.most_common(80)
        ]
        published_count = sum(1 for *_, basis in frame_stories if basis == "published")
        observed_count = len(frame_stories) - published_count
        display_end = min(frame_end - timedelta(minutes=1), snapshot_time)
        frames.append({
            "id": frame_start.isoformat(timespec="minutes"),
            "start": frame_start.isoformat(timespec="minutes"),
            "end": display_end.isoformat(timespec="minutes"),
            "label": f"{frame_start.strftime('%m/%d %H:%M')}—{display_end.strftime('%H:%M')}",
            "storyCount": len({normalized_title(story.title) for story, *_ in frame_stories}),
            "sourceCount": len({story.source for story, *_ in frame_stories}),
            "publishedCount": published_count,
            "observedFallbackCount": observed_count,
            "sparse": len(frame_stories) < 3,
            "nodes": nodes,
            "edges": frame_edges,
        })
        frame_start += timedelta(hours=3)
    return frames


def main() -> None:
    args = parse_args()
    stories, days, totals, latest_time = load_interest_stories(args.runtime_output, args.days)
    unique: dict[str, dict[str, Any]] = {}
    for story in stories:
        digest = hashlib.sha256(story.title.encode("utf-8")).hexdigest()
        if digest not in unique:
            unique[digest] = {"hash": digest, "title": story.title, "day": story.day}

    api_key = os.environ.get("AI_API_KEY", "")
    if not api_key:
        raise SystemExit("AI_API_KEY is required; use the keychain-backed runner")
    client = AIClient({
        "MODEL": os.environ.get("AI_MODEL", "deepseek/deepseek-v4-flash"),
        "API_KEY": api_key,
        "API_BASE": os.environ.get("AI_API_BASE", ""),
        "TEMPERATURE": 0.1,
        "MAX_TOKENS": 6500,
        "TIMEOUT": 180,
        "NUM_RETRIES": 2,
        "EXTRA_PARAMS": {
            "extra_body": {"thinking": {"type": "disabled"}},
        },
    })
    extractions = extract_all(client, list(unique.values()), args.cache, args.batch_size)
    canonical = merge_entity_names(extractions)

    entity_records: dict[str, list[tuple[filtered.Story, dict[str, Any]]]] = defaultdict(list)
    pair_counts: Counter[tuple[str, str]] = Counter()
    story_mappings: list[tuple[filtered.Story, dict[str, Any], set[str], datetime, str]] = []
    for story in stories:
        digest = hashlib.sha256(story.title.encode("utf-8")).hexdigest()
        result = extractions.get(digest, fallback_extraction(story.title))
        keys = []
        for entity in clean_entities(result):
            key = entity["key"]
            if key not in canonical:
                continue
            entity_records[key].append((story, result))
            keys.append(key)
        for left, right in combinations(sorted(set(keys)), 2):
            pair_counts[(left, right)] += 1
        event_time, time_basis = effective_datetime(story)
        story_mappings.append((story, result, set(keys), event_time, time_basis))

    latest = days[-1]
    previous = days[-2] if len(days) > 1 else latest
    cutoff = time_minutes(latest_time) or 1439
    snapshot_time = datetime.strptime(latest, "%Y-%m-%d").replace(
        hour=cutoff // 60,
        minute=cutoff % 60,
        tzinfo=LOCAL_TZ,
    )
    entities = []
    for key, records in entity_records.items():
        distinct_titles = {normalized_title(story.title) for story, _ in records}
        sources = Counter(story.source for story, _ in records)
        # Keep weak, single-source mentions from dominating the change feed. A
        # lone source needs at least three distinct headlines to count as an
        # observable entity trend; corroborated entities still need two.
        if len(sources) < 2 and len(distinct_titles) < 3:
            continue
        dated_records = [(story, result, *effective_datetime(story)) for story, result in records]
        current = [story for story, _, event_time, _ in dated_records if event_time.date().isoformat() == latest]
        prior = [
            story for story, _, event_time, _ in dated_records
            if event_time.date().isoformat() == previous
            and (event_time.hour * 60 + event_time.minute) <= cutoff
        ]
        current_strength = story_strength(current)
        previous_strength = story_strength(prior)
        current_window = [
            (story, result) for story, result, event_time, _ in dated_records
            if 0 <= (snapshot_time - event_time).total_seconds() < 3 * 3600
        ]
        prior_window = [
            (story, result) for story, result, event_time, _ in dated_records
            if 3 * 3600 <= (snapshot_time - event_time).total_seconds() < 6 * 3600
        ]
        source_first_times: dict[str, datetime] = {}
        for story, _, event_time, _ in dated_records:
            source_first_times[story.source] = min(source_first_times.get(story.source, event_time), event_time)
        current_sources = {
            source for source, first_time in source_first_times.items()
            if 0 <= (snapshot_time - first_time).total_seconds() < 3 * 3600
        }
        prior_sources = {
            source for source, first_time in source_first_times.items()
            if 3 * 3600 <= (snapshot_time - first_time).total_seconds() < 6 * 3600
        }
        by_day = Counter(event_time.date().isoformat() for _, _, event_time, _ in dated_records)
        strength_timeline = [
            {
                "date": day,
                "strength": story_strength([
                    story for story, _, event_time, _ in dated_records
                    if event_time.date().isoformat() == day
                ]),
                "count": by_day[day],
            }
            for day in days
        ]
        momentum = current_strength - previous_strength
        trend, streak = heat_streak(strength_timeline)
        event_changes_3h = distinct_event_count(current_window)
        previous_event_changes_3h = distinct_event_count(prior_window)
        spread_3h = len(current_sources)
        previous_spread_3h = len(prior_sources)
        entities.append({
            "id": f"entity:{hashlib.sha1(key.encode()).hexdigest()[:10]}",
            "key": key,
            "name": canonical[key]["name"],
            "type": canonical[key]["type"],
            "color": ENTITY_COLORS.get(canonical[key]["type"], ENTITY_COLORS["other"]),
            "strength": current_strength,
            "previousStrength": previous_strength,
            "momentum": momentum,
            "heatTrend": trend,
            "heatStreak": streak,
            "eventChanges3h": event_changes_3h,
            "previousEventChanges3h": previous_event_changes_3h,
            "eventVelocity3h": event_changes_3h,
            "eventAcceleration3h": event_changes_3h - previous_event_changes_3h,
            "spread3h": spread_3h,
            "previousSpread3h": previous_spread_3h,
            "spreadVelocity3h": spread_3h,
            "spreadAcceleration3h": spread_3h - previous_spread_3h,
            # Backward-compatible fields for older clients.
            "activity3h": event_changes_3h,
            "previousActivity3h": previous_event_changes_3h,
            "velocity3h": event_changes_3h - previous_event_changes_3h,
            "storyCount": len(distinct_titles),
            "sourceCount": len(sources),
            "firstObservedAt": min(observed_datetime(story) for story, _ in records).isoformat(timespec="minutes"),
            "lastObservedAt": max(
                datetime.strptime(story.day, "%Y-%m-%d").replace(
                    hour=(time_minutes(story.last_seen) or 0) // 60,
                    minute=(time_minutes(story.last_seen) or 0) % 60,
                    tzinfo=LOCAL_TZ,
                )
                for story, _ in records
            ).isoformat(timespec="minutes"),
            "sources": [source for source, _ in sources.most_common(7)],
            "strengthTimeline": strength_timeline,
            "timeline": build_timeline(records),
        })
    entities.sort(key=lambda entity: (-entity["eventVelocity3h"], -entity["spreadVelocity3h"], -entity["strength"], -entity["momentum"], -entity["storyCount"]))
    entities = entities[:32]
    visible_keys = {entity["key"]: entity["id"] for entity in entities}
    edges = [
        {
            "from": visible_keys[left],
            "to": visible_keys[right],
            "weight": count,
            "type": "cooccurs",
            "label": f"共同出现在 {count} 条线索中",
        }
        for (left, right), count in pair_counts.most_common()
        if left in visible_keys and right in visible_keys and count >= 1
    ][:80]
    frames = build_playback_frames(days, latest_time, entities, story_mappings)

    payload = {
        "meta": {
            "generatedAt": datetime.now().astimezone().isoformat(timespec="minutes"),
            "model": os.environ.get("AI_MODEL", "deepseek"),
            "dataFrom": days[0],
            "dataTo": latest,
            "latestCrawl": display_time(latest_time),
            "days": days,
            "newsRecords": totals["news"],
            "rssRecords": totals["rss"],
            "matchedRecords": len(stories),
            "extractedTitles": len(unique),
            "entityCount": len(entities),
            "relationCount": len(edges),
            "frameCount": len(frames),
        },
        "entities": entities,
        "edges": edges,
        "frames": frames,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(entities)} concrete entities and {len(edges)} evidence-backed relations to {args.output}")


if __name__ == "__main__":
    main()

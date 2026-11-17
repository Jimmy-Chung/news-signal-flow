"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Status = "new" | "rising" | "developing" | "cooling";
type SignalType = "new" | "amplifying" | "branching" | "accelerating" | "steady" | "cooling";

type TimelinePoint = { date: string; count: number };
type StrengthPoint = { date: string; count: number; strength: number };
type Change = { date: string; title: string; source: string; kind: string };
type Story = {
  title: string;
  source: string;
  url: string;
  date: string;
  score: number;
  rank: number | null;
};

type RadarEvent = {
  id: string;
  title: string;
  topic: string;
  summary: string;
  entities: string[];
  status: Status;
  attention: "important" | "watch";
  heat: number;
  strength: number;
  previousStrength: number;
  momentum: number;
  momentumPct: number;
  signalType: SignalType;
  signalLabel: string;
  signalReason: string;
  newSourceCount: number;
  sourceDelta: number;
  rankGain: number;
  novelTitleCount: number;
  echoTitleCount: number;
  noveltyRate: number;
  color: string;
  firstSeen: string;
  lastSeen: string;
  spanDays: number;
  storyCount: number;
  recordCount: number;
  sourceCount: number;
  uniqueUrlCount: number;
  bestRank: number | null;
  avgScore: number;
  timeline: TimelinePoint[];
  strengthTimeline: StrengthPoint[];
  changes: Change[];
  stories: Story[];
  sources: string[];
};

type Topic = {
  id: string;
  name: string;
  short: string;
  color: string;
  eventCount: number;
};

type Edge = {
  from: string;
  to: string;
  type: "belongs" | "related";
  label: string;
};

type Snapshot = {
  meta: {
    scope?: "broad" | "filtered";
    filterMode?: "raw" | "ai";
    generatedAt: string;
    dataFrom: string;
    dataTo: string;
    latestCrawl: string;
    days: string[];
    newsRecords: number;
    rssRecords: number;
    rankPoints: number;
    crawlRuns: number;
    matchedRecords: number;
    eventCount: number;
    topicCount: number;
    growingCount: number;
  };
  topics: Topic[];
  events: RadarEvent[];
  edges: Edge[];
};

type View = "overview" | "map" | "timeline";

const statusMeta: Record<Status, { label: string; tone: string; glyph: string }> = {
  new: { label: "新出现", tone: "mint", glyph: "✦" },
  rising: { label: "正在升温", tone: "amber", glyph: "↗" },
  developing: { label: "持续发展", tone: "blue", glyph: "●" },
  cooling: { label: "热度回落", tone: "slate", glyph: "↘" },
};

const signalMeta: Record<SignalType, { label: string; tone: string; glyph: string }> = {
  new: { label: "新信号", tone: "mint", glyph: "✦" },
  amplifying: { label: "传播增强", tone: "amber", glyph: "↑" },
  branching: { label: "叙事分叉", tone: "violet", glyph: "⑂" },
  accelerating: { label: "排名加速", tone: "blue", glyph: "↗" },
  steady: { label: "保持稳定", tone: "slate", glyph: "—" },
  cooling: { label: "正在减弱", tone: "slate", glyph: "↓" },
};

// A newly observed event is not yet a change. It stays in the background until
// a later crawl establishes that its reach, rank, or narrative has moved.
const growingSignals = new Set<SignalType>(["amplifying", "branching", "accelerating"]);

const sourceNames: Record<string, string> = {
  toutiao: "今日头条",
  baidu: "百度热搜",
  "wallstreetcn-hot": "华尔街见闻",
  thepaper: "澎湃新闻",
  "bilibili-hot-search": "Bilibili",
  "cls-hot": "财联社",
  ifeng: "凤凰网",
  tieba: "贴吧",
  weibo: "微博",
  douyin: "抖音",
  zhihu: "知乎",
  "hacker-news": "Hacker News",
  "yahoo-finance": "Yahoo Finance",
};

function displaySource(source: string) {
  return sourceNames[source] ?? source;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日` + (year ? "" : "");
}

function displayClock(value: string) {
  return value.replace(/^(\d{1,2})-(\d{2})$/, "$1:$2");
}

function MiniBars({ timeline, color }: { timeline: StrengthPoint[]; color: string }) {
  const max = Math.max(...timeline.map((point) => point.strength), 1);
  return (
    <div className="mini-bars" aria-label="九天热度变化">
      {timeline.map((point) => (
        <span
          key={point.date}
          title={`${point.date} · 强度 ${point.strength}`}
          style={{ height: `${Math.max(8, (point.strength / max) * 100)}%`, background: color }}
        />
      ))}
    </div>
  );
}

function SignalBadge({ type }: { type: SignalType }) {
  const meta = signalMeta[type];
  return <span className={`signal-badge ${meta.tone}`}><span>{meta.glyph}</span>{meta.label}</span>;
}

function StatusBadge({ status }: { status: Status }) {
  const meta = statusMeta[status];
  return (
    <span className={`status-badge ${meta.tone}`}>
      <span>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

function EventCard({ event, onSelect }: { event: RadarEvent; onSelect: (event: RadarEvent) => void }) {
  const delta = event.momentum > 0 ? `+${event.momentum}` : `${event.momentum}`;
  return (
    <button className="event-card signal-card" onClick={() => onSelect(event)} type="button">
      <div className="event-card-topline">
        <SignalBadge type={event.signalType} />
        <span className="event-topic" style={{ color: event.color }}>
          <i style={{ background: event.color }} />
          {event.topic}
        </span>
      </div>
      <div className="signal-card-title">
        <h3>{event.title}</h3>
        <strong className={event.momentum >= 0 ? "positive" : "negative"}>{delta}</strong>
      </div>
      <p>{event.signalReason}</p>
      <div className="strength-compare" aria-label={`强度从 ${event.previousStrength} 变为 ${event.strength}`}>
        <span>昨日同期 <b>{event.previousStrength}</b></span>
        <i><em style={{ width: `${event.previousStrength}%` }} /><strong style={{ width: `${event.strength}%`, background: event.color }} /></i>
        <span>现在 <b>{event.strength}</b></span>
      </div>
      <div className="signal-evidence">
        <span>+{event.newSourceCount} 新来源</span>
        <span>{event.novelTitleCount} 个新角度</span>
        {event.rankGain > 0 && <span>排名 ↑{event.rankGain}</span>}
      </div>
      <div className="event-card-footer">
        <MiniBars timeline={event.strengthTimeline} color={event.color} />
        <div className="event-card-stats">
          <span><strong>{event.storyCount}</strong> 条被折叠的线索</span>
          <span className="open-cue">查看为何变化 <b>↗</b></span>
        </div>
      </div>
    </button>
  );
}

type GraphNode = {
  id: string;
  kind: "topic" | "event";
  x: number;
  y: number;
  r: number;
  previousR?: number;
  color: string;
  label: string;
  event?: RadarEvent;
  topic?: Topic;
};

function GraphCanvas({
  events,
  topics,
  edges,
  selectedId,
  onSelect,
  onTopic,
  large = false,
}: {
  events: RadarEvent[];
  topics: Topic[];
  edges: Edge[];
  selectedId?: string;
  onSelect: (event: RadarEvent) => void;
  onTopic: (topic: string) => void;
  large?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(148, 163, 184, .11)";
    for (let x = 18; x < width; x += 24) {
      for (let y = 18; y < height; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const ringX = Math.max(100, width * (large ? 0.36 : 0.32));
    const ringY = Math.max(100, height * (large ? 0.35 : 0.31));
    const activeTopics = topics.filter((topic) => events.some((event) => event.topic === topic.name));
    const topicNodes: GraphNode[] = activeTopics.map((topic, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(activeTopics.length, 1)) * Math.PI * 2;
      return {
        id: topic.id,
        kind: "topic",
        x: centerX + Math.cos(angle) * ringX,
        y: centerY + Math.sin(angle) * ringY,
        r: large ? 26 : 22,
        color: topic.color,
        label: topic.short,
        topic,
      };
    });
    const topicMap = new Map(topicNodes.map((node) => [node.topic?.name, node]));
    const grouped = new Map<string, RadarEvent[]>();
    events.forEach((event) => grouped.set(event.topic, [...(grouped.get(event.topic) ?? []), event]));
    const eventNodes: GraphNode[] = [];
    grouped.forEach((groupEvents, topic) => {
      const parent = topicMap.get(topic);
      if (!parent) return;
      const centerAngle = Math.atan2(parent.y - centerY, parent.x - centerX);
      groupEvents.forEach((event, index) => {
        const spread = groupEvents.length === 1 ? 0 : (index / (groupEvents.length - 1) - 0.5) * 1.28;
        const distance = large ? 74 + (index % 2) * 24 : 58 + (index % 2) * 18;
        const angle = centerAngle + Math.PI + spread;
        eventNodes.push({
          id: event.id,
          kind: "event",
          x: parent.x + Math.cos(angle) * distance,
          y: parent.y + Math.sin(angle) * distance,
          r: (large ? 9 : 7) + event.strength / (large ? 10 : 14),
          previousR: (large ? 9 : 7) + event.previousStrength / (large ? 10 : 14),
          color: event.color,
          label: event.title,
          event,
        });
      });
    });
    const nodes = [...topicNodes, ...eventNodes];
    nodesRef.current = nodes;
    const byId = new Map(nodes.map((node) => [node.id, node]));

    edges.forEach((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      const emphasized = selectedId && (edge.from === selectedId || edge.to === selectedId);
      ctx.lineWidth = emphasized ? 1.8 : edge.type === "related" ? 1.1 : 0.8;
      ctx.strokeStyle = emphasized
        ? "rgba(226, 232, 240, .72)"
        : edge.type === "related"
          ? "rgba(148, 163, 184, .28)"
          : "rgba(148, 163, 184, .18)";
      if (edge.type === "related") ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    nodes.forEach((node) => {
      const selected = node.id === selectedId;
      const isHovered = hovered?.id === node.id;
      if (selected || isHovered) {
        const halo = ctx.createRadialGradient(node.x, node.y, node.r, node.x, node.y, node.r * 2.2);
        halo.addColorStop(0, `${node.color}42`);
        halo.addColorStop(1, `${node.color}00`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = node.kind === "topic" ? "#111c2d" : `${node.color}d8`;
      ctx.strokeStyle = node.color;
      ctx.lineWidth = selected ? 3 : node.kind === "topic" ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (node.kind === "event" && node.previousR && node.previousR > 0) {
        ctx.strokeStyle = "rgba(226, 232, 240, .72)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.previousR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (node.kind === "topic") {
        ctx.fillStyle = "#f8fafc";
        ctx.font = `700 ${large ? 12 : 11}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.label.slice(0, 4), node.x, node.y);
      } else if (large || selected || isHovered) {
        ctx.fillStyle = "rgba(226,232,240,.9)";
        ctx.font = `600 ${large ? 12 : 11}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = node.label.length > 12 ? `${node.label.slice(0, 12)}…` : node.label;
        ctx.fillText(label, node.x, node.y + node.r + 7);
      }
    });
  }, [edges, events, hovered, large, selectedId, topics]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  function hitNode(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return [...nodesRef.current]
      .reverse()
      .find((node) => Math.hypot(node.x - x, node.y - y) <= node.r + 7) ?? null;
  }

  return (
    <div className={`graph-canvas-wrap ${large ? "large" : ""}`}>
      <canvas
        ref={canvasRef}
        aria-label="主题与事件关系图"
        onMouseMove={(event) => {
          const node = hitNode(event);
          setHovered(node);
          event.currentTarget.style.cursor = node ? "pointer" : "default";
        }}
        onMouseLeave={() => setHovered(null)}
        onClick={(event) => {
          const node = hitNode(event);
          if (node?.event) onSelect(node.event);
          if (node?.topic) onTopic(node.topic.name);
        }}
      />
      {hovered && (
        <div className="graph-tooltip">
          <span style={{ background: hovered.color }} />
          <div>
            <strong>{hovered.kind === "event" ? hovered.event?.title : hovered.topic?.name}</strong>
            <small>
              {hovered.kind === "event"
                ? `强度 ${hovered.event?.strength} · 变化 ${hovered.event && hovered.event.momentum > 0 ? "+" : ""}${hovered.event?.momentum}`
                : `${hovered.topic?.eventCount} 个事件节点`}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ event, onClose }: { event: RadarEvent; onClose: () => void }) {
  const max = Math.max(...event.strengthTimeline.map((point) => point.strength), 1);
  const delta = event.momentum > 0 ? `+${event.momentum}` : `${event.momentum}`;
  return (
    <div className="detail-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="detail-panel" role="dialog" aria-modal="true" aria-label={event.title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <span className="eyebrow" style={{ color: event.color }}>
              <i style={{ background: event.color }} /> {event.topic}
            </span>
            <h2>{event.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭详情">×</button>
        </div>
        <div className="detail-status-row">
          <SignalBadge type={event.signalType} />
          <span>首次出现 {shortDate(event.firstSeen)}</span>
          <span>持续 {event.spanDays} 天</span>
        </div>

        <div className="change-explanation">
          <div className="change-score">
            <span>信号变化</span>
            <strong className={event.momentum >= 0 ? "positive" : "negative"}>{delta}</strong>
            <small>{event.previousStrength} → {event.strength}</small>
          </div>
          <div>
            <h3>{event.signalLabel}</h3>
            <p>{event.signalReason}</p>
          </div>
        </div>

        <div className="detail-metrics">
          <div><span>当前强度</span><strong>{event.strength}</strong><small>/ 100</small></div>
          <div><span>新增来源</span><strong>{event.newSourceCount}</strong><small>个</small></div>
          <div><span>新标题角度</span><strong>{event.novelTitleCount}</strong><small>条</small></div>
          <div><span>排名提升</span><strong>{event.rankGain > 0 ? event.rankGain : "—"}</strong><small>{event.rankGain > 0 ? "位" : "无"}</small></div>
        </div>

        <section className="detail-section">
          <div className="section-title-row">
            <h3>强度轨迹</h3>
            <span>{shortDate(event.firstSeen)} — {shortDate(event.lastSeen)}</span>
          </div>
          <div className="detail-chart">
            {event.strengthTimeline.map((point) => (
              <div className="detail-bar-column" key={point.date}>
                <span>{point.strength || ""}</span>
                <i style={{ height: `${Math.max(point.strength ? 8 : 2, (point.strength / max) * 100)}%`, background: event.color }} />
                <small>{point.date.slice(3).replace("-", "/")}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-title-row"><h3>事件背景</h3><span>背景信息，不触发新增提醒</span></div>
          <p className="detail-summary">{event.summary}</p>
        </section>

        <section className="detail-section">
          <div className="section-title-row"><h3>事件演化</h3><span>事件节点中的代表线索</span></div>
          <ol className="change-list">
            {event.changes.map((change, index) => (
              <li key={`${change.date}-${change.title}`}>
                <div className="change-marker" style={{ borderColor: event.color }}><span>{index + 1}</span></div>
                <div>
                  <div className="change-meta"><time>{change.date}</time><span>{change.kind}</span><small>{displaySource(change.source)}</small></div>
                  <p>{change.title}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="detail-section">
          <div className="section-title-row"><h3>关联实体</h3><span>用于后续跨事件连接</span></div>
          <div className="entity-list">
            {event.entities.map((entity) => <span key={entity}>{entity}</span>)}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-title-row"><h3>来源线索</h3><span>{event.uniqueUrlCount} 个独立链接</span></div>
          <div className="story-list">
            {event.stories.map((story, index) => (
              <a key={`${story.url}-${index}`} href={story.url || "#"} target="_blank" rel="noreferrer">
                <div><span>{displaySource(story.source)}</span><time>{story.date}</time></div>
                <p>{story.title}</p>
                <b>↗</b>
              </a>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function TimelineView({ events, days, onSelect }: { events: RadarEvent[]; days: string[]; onSelect: (event: RadarEvent) => void }) {
  return (
    <section className="timeline-page">
      <div className="page-intro">
        <div><span className="kicker">事件时间轴</span><h1>九天里，哪些叙事在增长？</h1></div>
        <p>每一行是一个持续事件。色块高度表示综合强度，而不是新闻条数；强度由来源扩散、榜单排名和标题角度共同构成。</p>
      </div>
      <div className="timeline-grid-wrap">
        <div className="timeline-header timeline-grid-row">
          <span>事件</span>
          {days.map((day) => <time key={day}>{day.slice(5).replace("-", "/")}</time>)}
          <span>状态</span>
        </div>
        {events.map((event) => {
          const max = Math.max(...event.strengthTimeline.map((point) => point.strength), 1);
          return (
            <button className="timeline-grid-row timeline-event-row" key={event.id} onClick={() => onSelect(event)} type="button">
              <span className="timeline-event-name"><i style={{ background: event.color }} /> <b>{event.title}</b><small>{event.topic}</small></span>
              {event.strengthTimeline.map((point) => (
                <span className="timeline-cell" key={point.date} title={`${point.date} · 强度 ${point.strength}`}>
                  {point.strength > 0 && <i style={{ height: `${32 + (point.strength / max) * 68}%`, background: event.color, opacity: .45 + (point.strength / max) * .55 }} />}
                  {point.strength > 0 && <small>{point.strength}</small>}
                </span>
              ))}
              <span><SignalBadge type={event.signalType} /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function EventRadar({ snapshot: rawSnapshot }: { snapshot: unknown }) {
  const snapshot = rawSnapshot as Snapshot;
  const isInterestView = snapshot.meta.filterMode === "ai";
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("全部主题");
  const [selected, setSelected] = useState<RadarEvent | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.events.filter((event) => {
      const matchesTopic = topic === "全部主题" || event.topic === topic;
      const haystack = [event.title, event.topic, event.summary, ...event.entities].join(" ").toLowerCase();
      return growingSignals.has(event.signalType) && matchesTopic && (!needle || haystack.includes(needle));
    });
  }, [query, snapshot.events, topic]);

  const changeEvents = useMemo(
    () => snapshot.events.filter((event) => growingSignals.has(event.signalType)),
    [snapshot.events],
  );
  const changeTopicCounts = useMemo(
    () => new Map(snapshot.topics.map((item) => [item.name, changeEvents.filter((event) => event.topic === item.name).length])),
    [changeEvents, snapshot.topics],
  );

  const visibleTopics = useMemo(
    () => snapshot.topics.filter((item) => filteredEvents.some((event) => event.topic === item.name)),
    [filteredEvents, snapshot.topics],
  );

  const spotlight = [...filteredEvents].sort((a, b) => b.momentum - a.momentum || b.strength - a.strength);
  const amplifyingCount = snapshot.events.filter((event) => event.signalType === "amplifying").length;
  const branchingCount = snapshot.events.filter((event) => event.signalType === "branching").length;
  const acceleratingCount = snapshot.events.filter((event) => event.signalType === "accelerating").length;
  const changeCount = changeEvents.length;

  function selectTopic(nextTopic: string) {
    setTopic(nextTopic);
    if (view === "map") return;
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span /><i /><b /></div>
          <div><strong>信号雷达</strong><small>TrendRadar Lab</small></div>
        </div>
        <nav className="main-nav" aria-label="主要视图">
          <button className={view === "overview" ? "active" : ""} onClick={() => { setView("overview"); setMobileNav(false); }}><span>◫</span>增强信号<small>{changeCount}</small></button>
          <button className={view === "map" ? "active" : ""} onClick={() => { setView("map"); setMobileNav(false); }}><span>⌘</span>强度地图<small>{changeCount}</small></button>
          <button className={view === "timeline" ? "active" : ""} onClick={() => { setView("timeline"); setMobileNav(false); }}><span>≋</span>强度演化</button>
        </nav>

        <div className="signal-scope">
          <span>{isInterestView ? "观察规则 · LLM 兴趣筛选已启用" : "观察规则 · AI 兴趣筛选已旁路"}</span>
          <div className="scope-rule"><i />只呈现已有基线后的变化</div>
          <small>{isInterestView
            ? "先按你的必须提醒、感兴趣和明确不要进行语义筛选，再观察事件变化。"
            : "首次出现的事件只进入后台观察池；有新来源、新角度或排名跃升后才进入页面。"}</small>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title"><span>关注主题</span><button onClick={() => setTopic("全部主题")}>重置</button></div>
          <button className={`topic-filter ${topic === "全部主题" ? "active" : ""}`} onClick={() => setTopic("全部主题")}><i className="all-dot" />全部变化<strong>{changeCount}</strong></button>
          {snapshot.topics.filter((item) => (changeTopicCounts.get(item.name) ?? 0) > 0).slice(0, 9).map((item) => (
            <button className={`topic-filter ${topic === item.name ? "active" : ""}`} key={item.id} onClick={() => selectTopic(item.name)}>
              <i style={{ background: item.color }} />{item.name}<strong>{changeTopicCounts.get(item.name)}</strong>
            </button>
          ))}
        </div>

        <div className="sidebar-snapshot">
          <span><i /> 本地采集正常</span>
          <p>连续 {snapshot.meta.days.length} 天 · {formatNumber(snapshot.meta.crawlRuns)} 轮采集</p>
          <small>数据更新至 {snapshot.meta.dataTo} {displayClock(snapshot.meta.latestCrawl)}</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="打开导航">☰</button>
          <div className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isInterestView ? "搜索当前兴趣事件…" : "搜索事件、公司或主题…"} aria-label="搜索事件" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            <span className="live-pill"><i /> LIVE</span>
            <button className="icon-button" title="此原型使用只读数据快照">···</button>
          </div>
        </header>

        {view === "overview" && (
          <div className="content overview-page">
            <section className="hero-row">
              <div>
                <span className="kicker">{shortDate(snapshot.meta.dataTo)} · {isInterestView ? "你的 LLM 兴趣图谱" : "广义新闻 · 未使用 AI 兴趣筛选"}</span>
                <h1>事件不用重读，<br /><em>只看什么在变强。</em></h1>
                <p>{isInterestView
                  ? `${formatNumber(snapshot.meta.matchedRecords)} 条记录通过了你预设的 LLM 兴趣筛选，并被折叠为 ${snapshot.meta.eventCount} 个持续事件。当前只呈现已有时间基线且来源、排名或叙事正在增强的 ${changeCount} 个信号。`
                  : `${formatNumber(snapshot.meta.matchedRecords)} 条原始记录未经兴趣筛选，先进入事件观察池；首次出现不会占据页面。当前只呈现已经建立时间基线，并且来源、排名或叙事确实发生变化的 ${changeCount} 个信号。`}</p>
              </div>
              <div className="attention-summary">
                <div><span className="attention-icon">↑</span><p>较昨日同期变强</p><strong>{changeCount}</strong><small>个已有基线的信号正在增强</small></div>
                <div className="attention-breakdown">
                  <span><i className="amber-dot" /><b>{amplifyingCount}</b> 传播增强</span>
                  <span><i className="mint-dot" /><b>{branchingCount}</b> 新角度</span>
                  <span><i className="blue-dot" /><b>{acceleratingCount}</b> 排名跃升</span>
                </div>
              </div>
            </section>

            <section className="metric-strip">
              <div><span>传播增强</span><strong>{amplifyingCount}</strong><small>更多来源加入同一事件</small></div>
              <div><span>叙事分叉</span><strong>{branchingCount}</strong><small>出现不同信息角度</small></div>
              <div><span>排名加速</span><strong>{acceleratingCount}</strong><small>榜单位置快速提升</small></div>
              <div><span>{isInterestView ? "兴趣结果折叠率" : "原始数据折叠率"}</span><strong>{Math.round((1 - snapshot.meta.eventCount / snapshot.meta.matchedRecords) * 100)}%</strong><small>{isInterestView ? "通过筛选后仍按事件去重" : "广义新闻不再逐条占用注意力"}</small></div>
            </section>

            <section className="overview-grid">
              <div className="event-feed">
                <div className="section-heading">
                  <div><h2>增强信号</h2><p>{topic === "全部主题" ? "按相对昨日同期的强度增幅排序" : `已聚焦：${topic}`}</p></div>
                  <span>{filteredEvents.length} 个正在观察</span>
                </div>
                <div className="event-card-list">
                  {spotlight.slice(0, 6).map((event) => <EventCard event={event} onSelect={setSelected} key={event.id} />)}
                  {spotlight.length === 0 && <div className="empty-state"><strong>没有匹配的事件</strong><p>试试清除搜索词或切换主题。</p></div>}
                </div>
              </div>

              <div className="map-panel">
                <div className="section-heading">
                  <div><h2>强度关系地图</h2><p>实心大小是现在，虚线圆环是昨日同期</p></div>
                  <button onClick={() => setView("map")}>展开地图 ↗</button>
                </div>
                <GraphCanvas events={filteredEvents} topics={visibleTopics} edges={snapshot.edges} selectedId={selected?.id} onSelect={setSelected} onTopic={selectTopic} />
                <div className="map-legend"><span><i className="topic-node" />主题</span><span><i className="event-node" />当前强度</span><span><i className="previous-ring" />昨日强度</span><small>节点变大 = 信号增强</small></div>
              </div>
            </section>
          </div>
        )}

        {view === "map" && (
          <div className="content map-page">
            <div className="page-intro">
              <div><span className="kicker">强度关系地图</span><h1>不是节点有什么，<br />而是节点变了多少。</h1></div>
              <p>节点面积代表当前综合强度，灰色虚线圆环代表昨日同期。实心超出圆环时，说明传播、排名或叙事结构正在增强。</p>
            </div>
            <div className="map-toolbar">
              <div className="map-status-filter">
                <button className={topic === "全部主题" ? "active" : ""} onClick={() => setTopic("全部主题")}>全部网络</button>
                {snapshot.topics.slice(0, 6).map((item) => <button className={topic === item.name ? "active" : ""} key={item.id} onClick={() => setTopic(item.name)}><i style={{ background: item.color }} />{item.short}</button>)}
              </div>
              <span>{filteredEvents.length} 个变化信号 · {visibleTopics.length} 个主题</span>
            </div>
            <div className="map-stage">
              <GraphCanvas large events={filteredEvents} topics={visibleTopics} edges={snapshot.edges} selectedId={selected?.id} onSelect={setSelected} onTopic={selectTopic} />
              <div className="map-insight">
                <span>当前增强最快</span>
                <strong>{spotlight[0]?.title ?? "暂无显著增强信号"}</strong>
                <p>{spotlight[0]?.signalReason ?? "当前筛选范围内没有超过阈值的强度变化。"}</p>
              </div>
            </div>
          </div>
        )}

        {view === "timeline" && (
          <div className="content"><TimelineView events={filteredEvents} days={snapshot.meta.days} onSelect={setSelected} /></div>
        )}
      </section>

      {mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}
      {selected && <DetailPanel event={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

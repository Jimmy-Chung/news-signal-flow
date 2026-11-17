"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StrengthPoint = { date: string; strength: number; count: number };
type Evidence = {
  title: string;
  source: string;
  url: string;
  date: string;
  time: string;
  timeBasis: "published" | "observed";
  publishedAt: string | null;
  observedDate: string;
  observedAt: string | null;
};
type EntityEvent = {
  id: string;
  name: string;
  type: string;
  changeType: string;
  date: string;
  time: string;
  timeBasis: "published" | "observed";
  publishedAt: string | null;
  observedDate: string;
  observedAt: string | null;
  sourceCount: number;
  evidenceCount: number;
  evidence: Evidence[];
};
type Entity = {
  id: string;
  key: string;
  name: string;
  type: string;
  color: string;
  strength: number;
  previousStrength: number;
  momentum: number;
  heatTrend: "rising" | "falling" | "stable";
  heatStreak: number;
  eventChanges3h: number;
  previousEventChanges3h: number;
  eventVelocity3h: number;
  eventAcceleration3h: number;
  spread3h: number;
  previousSpread3h: number;
  spreadVelocity3h: number;
  spreadAcceleration3h: number;
  activity3h: number;
  previousActivity3h: number;
  velocity3h: number;
  storyCount: number;
  sourceCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  sources: string[];
  strengthTimeline: StrengthPoint[];
  timeline: EntityEvent[];
  playbackSeen?: boolean;
};
type Relation = { from: string; to: string; weight: number; type: string; label: string };
type PlaybackNode = {
  id: string;
  seen: boolean;
  strength: number;
  eventChanges: number;
  newSources: number;
  storyCount: number;
  sourceCount: number;
  focus?: {
    inFrame: boolean;
    event: {
      name: string;
      type: string;
      changeType: string;
    };
    evidence: Evidence;
  } | null;
};
type PlaybackFrame = {
  id: string;
  start: string;
  end: string;
  label: string;
  storyCount: number;
  sourceCount: number;
  publishedCount: number;
  observedFallbackCount: number;
  sparse: boolean;
  nodes: PlaybackNode[];
  edges: Relation[];
};
type Snapshot = {
  meta: {
    generatedAt: string;
    model: string;
    dataFrom: string;
    dataTo: string;
    latestCrawl: string;
    days: string[];
    newsRecords: number;
    rssRecords: number;
    matchedRecords: number;
    extractedTitles: number;
    entityCount: number;
    relationCount: number;
    frameCount: number;
  };
  entities: Entity[];
  edges: Relation[];
  frames: PlaybackFrame[];
};
type View = "entities" | "graph" | "interests" | "inbox";
type InboxItem = {
  id: string;
  title: string;
  summary: string;
  originalUrl: string;
  source: string;
  entityId: string;
  entityName: string;
  entityType: string;
  eventId: string;
  eventType: string;
  changeType: string;
  publishedAt: string | null;
  observedAt: string | null;
  addedAt: string;
  completedAt: string | null;
};
type InboxInput = Omit<InboxItem, "id" | "addedAt" | "completedAt">;
type InboxAccess = "loading" | "ready" | "error";
type AdminJob = {
  id: string;
  kind: "deploy" | "run";
  status: "running" | "completed" | "failed";
  log: string;
  error?: string;
};
type StatusReport = { kind: "ok" | "error" | "loading"; text: string };
type Readiness = { interestsValid: boolean; apiKeySet: boolean };
type PlaybackSelection = {
  frame: Pick<PlaybackFrame, "id" | "start" | "end" | "label">;
  focus?: PlaybackNode["focus"];
};
type EntitySelection = {
  entity: Entity;
  playback?: PlaybackSelection;
};
type InterestDiffLine = {
  kind: "same" | "add" | "remove";
  text: string;
  beforeLine: number | null;
  afterLine: number | null;
};

const typeNames: Record<string, string> = {
  company: "公司",
  product: "产品",
  person: "人物",
  technology: "技术",
  organization: "组织",
  asset: "资产",
  place: "地点",
  policy: "政策",
  other: "其他",
};
const changeNames: Record<string, string> = {
  release: "发布",
  update: "更新",
  pricing: "定价变化",
  performance: "能力变化",
  partnership: "合作",
  regulation: "监管",
  management: "管理层",
  market_impact: "市场影响",
  rumor: "传闻",
  response: "回应",
  incident: "突发",
  analysis: "分析",
  other: "新线索",
};
const sourceNames: Record<string, string> = {
  toutiao: "今日头条", baidu: "百度热搜", "wallstreetcn-hot": "华尔街见闻",
  thepaper: "澎湃新闻", "bilibili-hot-search": "Bilibili", "cls-hot": "财联社",
  ifeng: "凤凰网", tieba: "贴吧", weibo: "微博", douyin: "抖音", zhihu: "知乎",
  "hacker-news": "Hacker News", "yahoo-finance": "Yahoo Finance",
};

function formatNumber(value: number) { return new Intl.NumberFormat("zh-CN").format(value); }
function displaySource(value: string) { return sourceNames[value] ?? value; }
function shortDate(value: string) { return value.slice(5).replace("-", "/"); }
function displayClock(value: string | null | undefined) { return value ? value.replace(/^(\d{1,2})-(\d{2})$/, "$1:$2") : "—"; }
function signed(value: number) { return value > 0 ? `+${value}` : `${value}`; }
function evidenceMoment(evidence: Evidence) { return `${evidence.date}T${evidence.time}`; }
function eventMoment(event: EntityEvent) { return `${event.date}T${event.time}`; }
function compactDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(/\s+/g, " ");
}
function comparableUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return value;
  }
}
function sameEvidence(left: Evidence, right: Evidence) {
  return left.title === right.title && left.source === right.source && evidenceMoment(left) === evidenceMoment(right);
}
function isSavedEvidence(item: InboxItem, evidence: Evidence) {
  if (item.originalUrl && evidence.url) return comparableUrl(item.originalUrl) === comparableUrl(evidence.url);
  return item.title === evidence.title
    && item.source === evidence.source
    && (item.publishedAt || item.observedAt) === (evidence.publishedAt || `${evidence.observedDate}T${evidence.observedAt}`);
}

class AdminRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function localAdminRequest(path: string, init: RequestInit = {}, suppliedToken = "") {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const token = suppliedToken || (typeof window === "undefined" ? "" : sessionStorage.getItem("trendradar-admin-token") || "");
  if (token) headers.set("x-trendradar-admin-token", token);
  const response = await fetch(`/api/local-admin${path}`, { ...init, headers, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new AdminRequestError(value.error || "请求失败", response.status);
  return value;
}
function normalizedInterestText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}
function interestLines(value: string) {
  const normalized = normalizedInterestText(value);
  return normalized ? normalized.split("\n") : [];
}
function buildInterestDiff(before: string, after: string): InterestDiffLine[] {
  const left = interestLines(before);
  const right = interestLines(after);
  const lengths = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex][rightIndex] = left[leftIndex] === right[rightIndex]
        ? lengths[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(lengths[leftIndex + 1][rightIndex], lengths[leftIndex][rightIndex + 1]);
    }
  }
  const diff: InterestDiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (leftIndex < left.length && rightIndex < right.length && left[leftIndex] === right[rightIndex]) {
      diff.push({ kind: "same", text: left[leftIndex], beforeLine: leftIndex + 1, afterLine: rightIndex + 1 });
      leftIndex += 1;
      rightIndex += 1;
    } else if (rightIndex < right.length && (leftIndex >= left.length || lengths[leftIndex][rightIndex + 1] >= lengths[leftIndex + 1][rightIndex])) {
      diff.push({ kind: "add", text: right[rightIndex], beforeLine: null, afterLine: rightIndex + 1 });
      rightIndex += 1;
    } else {
      diff.push({ kind: "remove", text: left[leftIndex], beforeLine: leftIndex + 1, afterLine: null });
      leftIndex += 1;
    }
  }
  return diff;
}
function heatLabel(entity: Entity) {
  if (entity.heatTrend === "rising") return entity.heatStreak > 1 ? `连续 ${entity.heatStreak} 日上升` : "关注度上升";
  if (entity.heatTrend === "falling") return entity.heatStreak > 1 ? `连续 ${entity.heatStreak} 日下降` : "关注度下降";
  return "关注度持平";
}

function MiniTrend({ points, color }: { points: StrengthPoint[]; color: string }) {
  const max = Math.max(...points.map((point) => point.strength), 1);
  return <div className="entity-mini-trend" aria-label="节点九天活跃度">
    {points.map((point) => <i key={point.date} title={`${point.date} · ${point.strength}`} style={{ height: `${Math.max(7, point.strength / max * 100)}%`, background: color }} />)}
  </div>;
}

function EntityCard({ entity, onSelect }: { entity: Entity; onSelect: (entity: Entity) => void }) {
  const delta = entity.momentum > 0 ? `+${entity.momentum}` : `${entity.momentum}`;
  return <button className="entity-card" onClick={() => onSelect(entity)} type="button">
    <div className="entity-card-head">
      <span className="entity-type"><i style={{ background: entity.color }} />{typeNames[entity.type] ?? "节点"}</span>
      <span className={`entity-velocity ${entity.heatTrend === "rising" ? "up" : entity.heatTrend === "falling" ? "down" : "flat"}`}>{heatLabel(entity)}</span>
    </div>
    <div className="entity-name-row"><h3>{entity.name}</h3><strong className={entity.momentum >= 0 ? "positive" : "negative"}>{delta}</strong></div>
    <p>{entity.timeline[0]?.name ?? "当前没有识别到新的具体进展"}</p>
    <div className="entity-speed-row">
      <span className="event-speed"><i />新增进展 <b>{entity.eventChanges3h}</b><small>/3h</small></span>
      <span className="spread-speed"><i />来源扩散 <b>{entity.spread3h}</b><small>源/3h</small></span>
    </div>
    <div className="entity-strength-row"><span>昨日同期 {entity.previousStrength}</span><i><em style={{ width: `${entity.previousStrength}%` }} /><b style={{ width: `${entity.strength}%`, background: entity.color }} /></i><span>现在 {entity.strength}</span></div>
    <div className="entity-card-foot">
      <MiniTrend points={entity.strengthTimeline} color={entity.color} />
      <div><span>{entity.storyCount} 条线索</span><span>{entity.sourceCount} 个来源</span></div>
    </div>
  </button>;
}

type GraphNode = Entity & { x: number; y: number; r: number };
type HeatMotion = { from: number; to: number; previousRadius: number; delta: number; startedAt: number };

function GraphLegendItem({ icon, label, help }: { icon: string; label: string; help: string }) {
  return <div className="graph-legend-item"><i className={icon} /><span>{label}</span><button type="button" aria-label={`解释${label}`}>?</button><b className="graph-metric-tooltip" role="tooltip">{help}</b></div>;
}

function EntityGraph({ entities, edges, layoutEdges = edges, onSelect, onStepFrame, showHeatMotion = false, colorByType = false }: { entities: Entity[]; edges: Relation[]; layoutEdges?: Relation[]; onSelect: (entity: Entity) => void; onStepFrame?: (direction: -1 | 1) => void; showHeatMotion?: boolean; colorByType?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const heatMotionRef = useRef<Map<string, HeatMotion>>(new Map());
  const hoveredRef = useRef<GraphNode | null>(null);
  const pinnedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.scale(ratio, ratio);
    const width = rect.width, height = rect.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,.075)";
    for (let x = 18; x < width; x += 26) for (let y = 18; y < height; y += 26) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    const nodes: GraphNode[] = entities.map((entity, index) => {
      const angle = index / Math.max(entities.length, 1) * Math.PI * 2;
      const ring = Math.min(width, height) * (.27 + (index % 4) * .055);
      const targetRadius = 9 + entity.strength / 9;
      const motion = heatMotionRef.current.get(entity.id);
      const progress = !showHeatMotion || reducedMotion || !motion ? 1 : Math.min(1, Math.max(0, (now - motion.startedAt) / 620));
      const eased = 1 - Math.pow(1 - progress, 3);
      const radius = motion ? motion.from + (motion.to - motion.from) * eased : targetRadius;
      return { ...entity, color: colorByType ? entity.color : "#E8E8E8", x: width / 2 + Math.cos(angle) * ring, y: height / 2 + Math.sin(angle) * ring, r: radius };
    });
    const maxEventSpeed = Math.max(...nodes.map((node) => node.eventChanges3h), 1);
    const maxSpreadSpeed = Math.max(...nodes.map((node) => node.spread3h), 1);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const activeEdges = edges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
    const layoutActiveEdges = layoutEdges.filter((edge) => byId.has(edge.from) && byId.has(edge.to));
    for (let iteration = 0; iteration < 140; iteration++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const separation = a.r + b.r + 34;
        const force = distance < separation ? Math.min(5, 1.2 + (separation - distance) * .12) : Math.min(3.2, 1400 / (distance * distance));
        dx /= distance; dy /= distance; a.x -= dx * force; a.y -= dy * force; b.x += dx * force; b.y += dy * force;
      }
      layoutActiveEdges.forEach((edge) => {
        const a = byId.get(edge.from)!, b = byId.get(edge.to)!; let dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(Math.hypot(dx, dy), 1); const target = 126 + Math.min(54, 100 / Math.max(edge.weight, 1));
        const force = (distance - target) * .0048 * Math.min(3, Math.log2(edge.weight + 1)); dx /= distance; dy /= distance;
        a.x += dx * force; a.y += dy * force; b.x -= dx * force; b.y -= dy * force;
      });
      nodes.forEach((node) => {
        node.x += (width / 2 - node.x) * .002; node.y += (height / 2 - node.y) * .002;
        node.x = Math.max(36, Math.min(width - 36, node.x));
        node.y = Math.max(28, Math.min(height - 42, node.y));
      });
    }
    nodes.forEach((node) => {
      const pinned = pinnedPositionsRef.current.get(node.id);
      if (!pinned) return;
      node.x = Math.max(36, Math.min(width - 36, pinned.x * width));
      node.y = Math.max(28, Math.min(height - 42, pinned.y * height));
    });
    nodesRef.current = nodes;
    activeEdges.forEach((edge) => {
      const a = byId.get(edge.from)!, b = byId.get(edge.to)!;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(148,163,184,${Math.min(.55, .12 + Math.log2(edge.weight + 1) * .08)})`;
      ctx.lineWidth = Math.min(3.5, .6 + Math.log2(edge.weight + 1) * .45); ctx.stroke();
    });
    nodes.forEach((node) => {
      const seen = node.playbackSeen !== false;
      const active = hoveredRef.current?.id === node.id;
      const motion = heatMotionRef.current.get(node.id);
      const motionProgress = !motion ? 1 : Math.min(1, Math.max(0, (now - motion.startedAt) / 620));
      if (showHeatMotion && seen && motion && motion.delta !== 0) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, motion.previousRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(203,213,225,.48)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3.5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (motionProgress < 1 && !reducedMotion) {
          const pulse = Math.sin(motionProgress * Math.PI);
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 6 + pulse * 4, 0, Math.PI * 2);
          ctx.strokeStyle = motion.delta > 0 ? `rgba(74,158,92,${.18 + pulse * .52})` : `rgba(215,25,33,${.16 + pulse * .5})`;
          ctx.lineWidth = 1.5 + pulse * 2.5;
          ctx.stroke();
        }
      }
      if (active && seen) { ctx.fillStyle = `${node.color}2d`; ctx.beginPath(); ctx.arc(node.x, node.y, node.r * 1.8, 0, Math.PI * 2); ctx.fill(); }
      if (seen && node.spread3h > 0) {
        const spreadArc = Math.PI * 2 * (.16 + .84 * node.spread3h / maxSpreadSpeed);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 9, -Math.PI / 2, -Math.PI / 2 + spreadArc);
        ctx.strokeStyle = "rgba(153,153,153,.84)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([2.5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (seen && node.eventChanges3h > 0) {
        const eventArc = Math.PI * 2 * (.2 + .8 * node.eventChanges3h / maxEventSpeed);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r + 4.5, -Math.PI / 2, -Math.PI / 2 + eventArc);
        ctx.strokeStyle = "rgba(212,168,67,.94)";
        ctx.lineWidth = 2 + Math.min(3.5, node.eventChanges3h * .7);
        ctx.stroke();
      }
      ctx.fillStyle = seen ? `${node.color}df` : "rgba(71,85,105,.14)"; ctx.strokeStyle = active ? "#fff" : seen ? node.color : "rgba(100,116,139,.2)"; ctx.lineWidth = active ? 2.5 : 1;
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (!seen) return;
      if (showHeatMotion && motion && motion.delta !== 0) {
        ctx.fillStyle = motion.delta > 0 ? "rgba(74,158,92,.96)" : "rgba(215,25,33,.96)";
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        ctx.font = "700 8px ui-sans-serif,system-ui";
        ctx.fillText(`${motion.delta > 0 ? "↑" : "↓"}${Math.abs(motion.delta)}`, node.x + node.r + 3, node.y - node.r + 1);
      }
      ctx.fillStyle = "rgba(238,244,250,.94)"; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.font = `${active ? 700 : 600} ${active ? 12 : 10}px ui-sans-serif,system-ui`;
      const label = node.name.length > 12 ? `${node.name.slice(0, 12)}…` : node.name;
      ctx.fillText(label, node.x, node.y + node.r + 6);
    });
  }, [colorByType, edges, entities, layoutEdges, showHeatMotion]);

  useEffect(() => {
    const priorRadii = new Map(nodesRef.current.map((node) => [node.id, node.r]));
    const startedAt = performance.now();
    heatMotionRef.current = new Map(entities.map((entity) => {
      const target = 9 + entity.strength / 9;
      const previousRadius = 9 + entity.previousStrength / 9;
      return [entity.id, {
        from: showHeatMotion ? (priorRadii.get(entity.id) ?? previousRadius) : target,
        to: target,
        previousRadius,
        delta: entity.strength - entity.previousStrength,
        startedAt,
      }];
    }));
    let animationFrame = 0;
    const animate = () => {
      draw();
      if (showHeatMotion && performance.now() - startedAt < 650) animationFrame = window.requestAnimationFrame(animate);
    };
    animate();
    const canvas = canvasRef.current;
    if (!canvas) return () => window.cancelAnimationFrame(animationFrame);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => { observer.disconnect(); window.cancelAnimationFrame(animationFrame); };
  }, [draw, entities, showHeatMotion]);
  function hitAt(canvas: HTMLCanvasElement, clientX: number, clientY: number) { const rect = canvas.getBoundingClientRect(); const x = clientX - rect.left, y = clientY - rect.top; return [...nodesRef.current].reverse().find((node) => node.playbackSeen !== false && Math.hypot(node.x - x, node.y - y) <= node.r + 10) ?? null; }
  return <div className="entity-graph-wrap">
    <canvas ref={canvasRef} tabIndex={onStepFrame ? 0 : undefined} aria-label={`节点图谱：可拖拽；大小表示关注度，黄色实线外环表示进展更新速度，蓝色虚线外环表示来源扩散速度${onStepFrame ? "；点选图谱后可用左右方向键切换相邻时间片" : ""}`}
      onKeyDown={(event) => {
        if (!onStepFrame || event.altKey || event.ctrlKey || event.metaKey) return;
        const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!direction) return;
        event.preventDefault();
        onStepFrame(direction);
      }}
      onPointerDown={(event) => { if (onStepFrame) event.currentTarget.focus(); const node = hitAt(event.currentTarget, event.clientX, event.clientY); if (!node) return; dragRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.style.cursor = "grabbing"; }}
      onPointerMove={(event) => { const drag = dragRef.current; if (drag) { const rect = event.currentTarget.getBoundingClientRect(); if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true; pinnedPositionsRef.current.set(drag.id, { x: Math.max(36, Math.min(rect.width - 36, event.clientX - rect.left)) / rect.width, y: Math.max(28, Math.min(rect.height - 42, event.clientY - rect.top)) / rect.height }); const node = nodesRef.current.find((item) => item.id === drag.id) ?? null; hoveredRef.current = node; setHovered(node); draw(); return; } const node = hitAt(event.currentTarget, event.clientX, event.clientY); hoveredRef.current = node; setHovered(node); draw(); event.currentTarget.style.cursor = node ? "grab" : "default"; }}
      onPointerUp={(event) => { const drag = dragRef.current; suppressClickRef.current = Boolean(drag?.moved); dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); event.currentTarget.style.cursor = hoveredRef.current ? "grab" : "default"; }}
      onPointerCancel={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); event.currentTarget.style.cursor = "default"; }}
      onPointerLeave={() => { if (dragRef.current) return; hoveredRef.current = null; setHovered(null); draw(); }}
      onClick={(event) => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } const node = hitAt(event.currentTarget, event.clientX, event.clientY); if (node) onSelect(node); }} />
    <div className="entity-graph-legend" aria-label="图谱指标与计算口径">
      <GraphLegendItem icon="legend-size" label="关注度" help="节点大小。使用过去 24 小时滚动关注度，由去重标题数、独立来源数、榜单位置和 AI 相关度共同计算。" />
      {showHeatMotion && <><GraphLegendItem icon="legend-previous" label="上一时间片大小" help="灰色虚线保留前一个 3 小时时间片的节点大小，用来直接比较关注度变化。" /><GraphLegendItem icon="legend-heat-change" label="关注度升降" help="绿色 ↑ 表示较上一时间片增强，红色 ↓ 表示减弱；旁边的数字是关注度差值。" /></>}
      <GraphLegendItem icon="legend-event" label="新增进展" help="当前 3 小时内语义去重后的具体进展数量。媒体重复报道同一件事不会重复增加。" />
      <GraphLegendItem icon="legend-spread" label="新增来源" help="当前 3 小时内首次加入该节点报道的独立来源数量，同一来源多篇只计算一次。" />
      <GraphLegendItem icon="legend-time" label="时间" help="优先使用新闻发布时间；原文没有发布时间时，才回退到 TrendRadar 首次采集时间。" />
      <span className="graph-drag-hint">{onStepFrame ? "拖拽节点调整位置 · 点选图谱后 ← → 切换时间" : "拖拽节点调整位置"}</span>
    </div>
    {hovered && <div className="entity-graph-tip"><i style={{ background: hovered.color }} /><div><strong>{hovered.name}</strong><span>{showHeatMotion ? `关注度 ${hovered.previousStrength} → ${hovered.strength}（${signed(hovered.momentum)}）` : `关注度 ${hovered.strength}（${signed(hovered.momentum)}）`} · 新增进展 {hovered.eventChanges3h} · 新增来源 {hovered.spread3h}</span></div></div>}
  </div>;
}

function PlaybackGraph({ entities, frames, layoutEdges, onSelect }: { entities: Entity[]; frames: PlaybackFrame[]; layoutEdges: Relation[]; onSelect: (entity: Entity, playback: PlaybackSelection) => void }) {
  const availableStart = frames[0]?.start.slice(0, 10) ?? "";
  const availableEnd = frames.at(-1)?.start.slice(0, 10) ?? "";
  const [rangeStart, setRangeStart] = useState(availableStart);
  const [rangeEnd, setRangeEnd] = useState(availableEnd);
  const playbackFrames = useMemo(
    () => frames.filter((item) => {
      const date = item.start.slice(0, 10);
      return (!rangeStart || date >= rangeStart) && (!rangeEnd || date <= rangeEnd);
    }),
    [frames, rangeEnd, rangeStart],
  );
  const [frameIndex, setFrameIndex] = useState(Math.max(0, playbackFrames.length - 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [colorByType, setColorByType] = useState(false);
  const frame = playbackFrames[frameIndex] ?? playbackFrames[0];

  useEffect(() => {
    if (!playing || playbackFrames.length < 2) return;
    if (frameIndex >= playbackFrames.length - 1) return;
    const timer = window.setTimeout(() => setFrameIndex((index) => {
      const next = Math.min(playbackFrames.length - 1, index + 1);
      if (next >= playbackFrames.length - 1) setPlaying(false);
      return next;
    }), 900 / speed);
    return () => window.clearTimeout(timer);
  }, [frameIndex, playbackFrames.length, playing, speed]);

  const frameEntities = useMemo(() => {
    if (!frame) return entities;
    const current = new Map(frame.nodes.map((node) => [node.id, node]));
    const previous = new Map((playbackFrames[Math.max(0, frameIndex - 1)]?.nodes ?? []).map((node) => [node.id, node]));
    return entities.map((entity) => {
      const node = current.get(entity.id);
      const prior = previous.get(entity.id);
      if (!node) return { ...entity, playbackSeen: false, strength: 0, eventChanges3h: 0, spread3h: 0 };
      const momentum = node.strength - (prior?.strength ?? 0);
      return {
        ...entity,
        playbackSeen: node.seen,
        strength: node.strength,
        previousStrength: prior?.strength ?? 0,
        momentum,
        heatTrend: momentum > 0 ? "rising" as const : momentum < 0 ? "falling" as const : "stable" as const,
        eventChanges3h: node.eventChanges,
        spread3h: node.newSources,
        storyCount: node.storyCount,
        sourceCount: node.sourceCount,
      };
    });
  }, [entities, frame, frameIndex, playbackFrames]);

  if (!frame) return <p>暂无可播放的时间片。</p>;
  const visibleIds = new Set(entities.map((entity) => entity.id));
  const visibleNodes = frame.nodes.filter((node) => visibleIds.has(node.id));
  const activeEntities = visibleNodes.filter((node) => node.seen && node.strength > 0).length;
  const newFacts = visibleNodes.reduce((sum, node) => sum + node.eventChanges, 0);
  const newMedia = visibleNodes.reduce((sum, node) => sum + node.newSources, 0);

  function togglePlayback() {
    if (playing) { setPlaying(false); return; }
    if (frameIndex >= playbackFrames.length - 1) setFrameIndex(0);
    setPlaying(true);
  }

  function updateRange(start: string, end: string) {
    setPlaying(false);
    setRangeStart(start);
    setRangeEnd(end);
    setFrameIndex(0);
  }

  function stepFrame(direction: -1 | 1) {
    setPlaying(false);
    setFrameIndex((index) => Math.max(0, Math.min(playbackFrames.length - 1, index + direction)));
  }

  return <section className="graph-player" aria-label="三小时时间播放器">
    <div className="graph-date-range">
      <div><span>播放日期区间</span><strong>选择范围后，只播放范围内的 3 小时时间片</strong></div>
      <label><span>开始日期</span><input type="date" min={availableStart} max={rangeEnd || availableEnd} value={rangeStart} onChange={(event) => updateRange(event.target.value, event.target.value > rangeEnd ? event.target.value : rangeEnd)} /></label>
      <i>—</i>
      <label><span>结束日期</span><input type="date" min={rangeStart || availableStart} max={availableEnd} value={rangeEnd} onChange={(event) => updateRange(event.target.value < rangeStart ? event.target.value : rangeStart, event.target.value)} /></label>
      <button type="button" onClick={() => updateRange(availableStart, availableEnd)}>全部日期</button>
    </div>
    <div className="graph-player-status">
      <div><span className="graph-player-kicker">当前时间片 · {frameIndex + 1}/{playbackFrames.length}</span><strong>{frame.label}</strong><small>{rangeStart} 至 {rangeEnd} · 共 {playbackFrames.length} 个时间片 · {frame.sparse ? "本时间片数据较稀疏" : `${frame.storyCount} 条线索 · ${frame.sourceCount} 个来源`} · {frame.publishedCount} 条发布时间 · {frame.observedFallbackCount} 条观测时间</small></div>
      <div className="graph-frame-metrics"><span><b>{activeEntities}</b> 活跃节点</span><span><b>{newFacts}</b> 新增进展</span><span><b>{newMedia}</b> 新增来源</span></div>
    </div>
    <EntityGraph entities={frameEntities} edges={frame.edges} layoutEdges={layoutEdges} onStepFrame={stepFrame} onSelect={(entity) => {
      onSelect(entity, {
        frame: { id: frame.id, start: frame.start, end: frame.end, label: frame.label },
        focus: frame.nodes.find((node) => node.id === entity.id)?.focus,
      });
    }} showHeatMotion colorByType={colorByType} />
    <div className="graph-player-controls">
      <button type="button" onClick={() => stepFrame(-1)} aria-label="上一个三小时">‹</button>
      <button className="player-toggle" type="button" onClick={togglePlayback}>{playing ? "暂停" : frameIndex >= playbackFrames.length - 1 ? "从区间起点播放" : "播放"}</button>
      <button type="button" onClick={() => stepFrame(1)} aria-label="下一个三小时">›</button>
      <label className="graph-scrubber"><span className="sr-only">选择三小时时间片</span><input type="range" min="0" max={Math.max(0, playbackFrames.length - 1)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} /></label>
      <label className="graph-speed"><span>速度</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      <label className="graph-color-toggle"><input type="checkbox" checked={colorByType} onChange={(event) => setColorByType(event.target.checked)} /><i /><span>按节点类型着色</span></label>
    </div>
  </section>;
}

function HeatTrend({ entity }: { entity: Entity }) {
  const points = entity.strengthTimeline;
  const max = Math.max(...points.map((point) => point.strength), 1);
  const latest = points[points.length - 1]?.strength ?? 0;
  const peak = Math.max(...points.map((point) => point.strength), 0);
  return <section className="entity-detail-section entity-heat-section">
    <div className="entity-section-title"><div><h3>关注度变化</h3><small>按天展示最近 {points.length} 天关注度</small></div><span>当前 {latest}</span></div>
    <div className="entity-heat-summary"><span><b>{latest}</b> 当前关注度</span><span><b>{peak}</b> 区间峰值</span></div>
    <div className="entity-heat-chart" role="img" aria-label={`${entity.name} 最近 ${points.length} 天关注度变化，当前 ${latest}，区间峰值 ${peak}`}>
      {points.map((point) => <div className="entity-heat-column" key={point.date}><strong>{point.strength}</strong><div><i style={{ height: `${point.strength > 0 ? Math.max(8, point.strength / max * 100) : 2}%`, background: entity.color }} /></div><time>{shortDate(point.date)}</time></div>)}
    </div>
  </section>;
}


type SavePhase = "saving" | "deploying" | "done" | "error";
type SaveState = { phase: SavePhase; percent: number; label: string } | null;

function useSaveProgress() {
  const [state, setState] = useState<SaveState>(null);
  const [elapsed, setElapsed] = useState(0);
  const begin = useCallback(() => {
    setElapsed(0);
    setState({ phase: "saving", percent: 8, label: "正在保存配置…" });
  }, []);
  const stage = useCallback((label = "正在同步到运行副本…") => {
    setState({ phase: "deploying", percent: 40, label });
  }, []);
  const finish = useCallback((label = "已保存并生效") => {
    setState({ phase: "done", percent: 100, label });
  }, []);
  const fail = useCallback((label: string) => {
    setState((current) => ({ phase: "error", percent: current?.percent ?? 8, label }));
  }, []);
  const reset = useCallback(() => setState(null), []);

  // 部署/采集阶段没有真实百分比：条子推进后停住，同时按秒计时，避免像卡死。
  useEffect(() => {
    if (state?.phase !== "deploying") return;
    const raf = window.requestAnimationFrame(() => {
      setState((current) => current && current.phase === "deploying" ? { ...current, percent: 90 } : current);
    });
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => { window.cancelAnimationFrame(raf); window.clearInterval(timer); };
  }, [state?.phase]);

  // 成功态只短暂停留，避免进度条一直占着页脚。
  useEffect(() => {
    if (state?.phase !== "done") return;
    const timer = window.setTimeout(() => setState(null), 2600);
    return () => window.clearTimeout(timer);
  }, [state?.phase]);

  return { state, elapsed, begin, stage, finish, fail, reset };
}

function SaveProgressBar({ state, elapsed }: { state: SaveState; elapsed: number }) {
  if (!state) return null;
  const counting = state.phase === "deploying";
  const label = counting ? `${state.label} ${elapsed}s` : state.label;
  return <div className="save-progress" data-phase={state.phase} role="status" aria-live="polite">
    <div className="save-progress-track"><i style={{ width: `${state.percent}%` }} /></div>
    <span className="save-progress-label">{label}</span>
  </div>;
}

const INTEREST_TEMPLATE = `感兴趣的：
- 英伟达（NVIDIA / NVDA）、AMD 的财报、新芯片与供应链消息
- AI 大模型的发布、融资、开源与商业化进展
- AI 算力、数据中心和电力配套的变化

必须抓取的：
- 英伟达、AMD 发布新芯片、财报或重大合作
- 美国对华 AI 芯片出口限制、关税与监管政策
- 黄仁勋、苏姿丰的重要公开表态

不感兴趣的：
- 广告、招聘、抽奖、促销和标题党
- 只有行情数字、没有具体事件的播报
- 与科技和半导体无关的娱乐八卦
`;

function buildInterestPrompt(current: string) {
  const existing = current.trim();
  return [
    "你是一个新闻情报配置助手。请帮我写一份 user_interests.txt，用来告诉新闻采集系统：我关注什么、什么必须抓到、什么不要。",
    "",
    "请这样工作：",
    "1. 先用 3-5 个简短问题了解我关注的行业、公司、人物、事件，以及我不想看到的内容。一次只问一个问题，等我回答后再问下一个。",
    "2. 问完后直接输出完整文档，不要解释，不要寒暄。",
    "",
    "文档必须只包含以下三个段落，段落名一字不差，使用纯文本，不要 Markdown 表格：",
    "",
    "感兴趣的：",
    "- 每个主题写一行，带上具体的公司、产品、人物或事件名；写 5-12 条",
    "",
    "必须抓取的：",
    "- 写“一旦发生就必须提醒我”的具体事件；写 3-8 条",
    "",
    "不感兴趣的：",
    "- 写明确排除的内容；写 2-6 条",
    "",
    "写作要求：",
    "- 每行只写一件事，尽量具体，例如“英伟达、AMD 的新芯片与财报”，不要写“科技新闻”。",
    "- 不要输出标题、日期、编号、解释、前言或结语。",
    "- 把最终文档放进一个代码块，方便我整体复制。",
  ].join("\n") + (existing ? `\n\n我当前已保存的内容如下，请在此基础上调整，保留仍然有效的部分：\n\n${existing}` : "");
}

function InterestSettings({ request, onReport, notify, onCleared }: { request: (path: string, init?: RequestInit) => Promise<any>; onReport: (text: string, kind?: StatusReport["kind"]) => void; notify: (text: string) => void; onCleared: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [templateUndo, setTemplateUndo] = useState<string | null>(null);
  const [job, setJob] = useState<AdminJob | null>(null);
  const copyTimer = useRef<number | null>(null);
  const { state: saveState, elapsed: saveElapsed, begin: beginSave, stage: stageSave, finish: finishSave, fail: failSave, reset: resetSave } = useSaveProgress();
  const interestDiff = useMemo(() => buildInterestDiff(savedContent, content), [content, savedContent]);
  const hasInterestChanges = normalizedInterestText(content) !== normalizedInterestText(savedContent);
  const addedInterestLines = interestDiff.filter((line) => line.kind === "add").length;
  const removedInterestLines = interestDiff.filter((line) => line.kind === "remove").length;

  const load = useCallback(async () => {
    setBusy("load");
    setMessage("");
    try {
      const value = await request("/interests");
      setContent(value.content);
      setSavedContent(value.content);
      setUpdatedAt(value.updatedAt);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const value = await request(`/jobs/${job.id}`);
        setJob(value);
        if (value.status === "completed") {
          // 保存只写规则并做配置校验；采集由定时任务负责，下一轮才会用新规则。
          onReport("规则已保存，下一轮采集生效。", "ok");
          setMessage("已保存；下一轮采集会按新规则筛选");
          notify("规则已保存，下一轮采集生效");
          finishSave("已保存");
          void load();
        } else if (value.status === "failed") {
          onReport(`生效失败：${value.error || "任务失败"}`, "error");
          setMessage(value.error || "任务失败");
          notify(`生效失败：${value.error || "任务失败"}`);
          failSave(`生效失败：${value.error || "任务失败"}`);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        onReport(`生效失败：${text}`, "error");
        setMessage(text);
        notify(`生效失败：${text}`);
        failSave(`生效失败：${text}`);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, request, onReport, notify, finishSave, failSave, load]);

  // 成功提示只在内容仍然已同步时保留；再次编辑就复位进度条。
  useEffect(() => {
    if (saveState?.phase === "done" && hasInterestChanges) resetSave();
  }, [saveState?.phase, hasInterestChanges, resetSave]);

  async function copyPrompt() {
    const text = buildInterestPrompt(content.trim() ? content : savedContent);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 非安全上下文没有 Clipboard API 时退回隐藏 textarea + execCommand。
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) throw new Error("execCommand 复制失败");
      } catch {
        notify("复制失败，请手动选中提示词复制");
        return;
      }
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2400);
    notify("提示词已复制，去 AI 工具里粘贴即可");
  }

  function fillTemplate() {
    // 重复点“填入模板”时保留第一次的原文，避免撤销入口被覆盖掉。
    setTemplateUndo((current) => content && content !== INTEREST_TEMPLATE ? content : current);
    setContent(INTEREST_TEMPLATE);
  }

  async function save() {
    setBusy("save");
    setMessage("");
    notify("正在保存配置…");
    beginSave();
    try {
      await request("/interests", { method: "POST", body: JSON.stringify({ content }) });
      setSavedContent(content.endsWith("\n") ? content : `${content}\n`);
      setTemplateUndo(null);
      onReport("正在同步配置到运行副本…", "loading");
      stageSave();
      const value = await request("/actions/deploy", { method: "POST", body: JSON.stringify({}) });
      setJob(value);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      onReport(`保存失败：${text}`, "error");
      setMessage(text);
      notify(`保存失败：${text}`);
      failSave(`保存失败：${text}`);
    } finally { setBusy(""); }
  }

  async function clearInterests() {
    setConfirmClear(false);
    setBusy("clear");
    setMessage("");
    try {
      await request("/interests", { method: "DELETE" });
      setContent("");
      setSavedContent("");
      setUpdatedAt("");
      setTemplateUndo(null);
      onReport("兴趣设置已清空；配置新的规则后才能开始采集。", "ok");
      // 清空后立刻把页面切回「先完成配置」：由上层重新读取 readiness 并关闭设置弹窗。
      onCleared();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      onReport(`清空失败：${text}`, "error");
      setMessage(text);
      notify(`清空失败：${text}`);
    } finally { setBusy(""); }
  }

  return <div className="settings-section interest-settings">
    <div className="settings-scroll">
      <div className="settings-section-head"><h2>兴趣设置</h2><span className="kicker">先让 AI 帮你写清楚，再粘贴回来保存</span></div>
      <ol className="interest-steps" aria-label="使用步骤">
        <li><b>01</b><span>点左下角「复制提示词到 AI 工具」。</span></li>
        <li><b>02</b><span>粘贴到任意 AI 工具，按它的提问补充你的兴趣；AI 会生成一份完整文档。</span></li>
        <li><b>03</b><span>把文档粘贴到右侧输入框。下方会预览「上次保存」与「本次内容」的差异，确认后保存。</span></li>
      </ol>
      <div className="interest-layout">
        <section className="interest-template" aria-label="兴趣配置模板">
          <div className="interest-panel-head">
            <div><span>模板 · 示例</span><strong>三段式：感兴趣 / 必须抓取 / 不感兴趣</strong></div>
            <button type="button" className="template-fill" onClick={fillTemplate} disabled={Boolean(busy) || job?.status === "running"}>填入模板</button>
          </div>
          <pre>{INTEREST_TEMPLATE}</pre>
          {templateUndo !== null && <button type="button" className="template-undo" onClick={() => { setContent(templateUndo); setTemplateUndo(null); }}>撤销填入，恢复之前的内容</button>}
        </section>
        <section className="interest-editor">
          <div className="interest-panel-head"><div><span>user_interests.txt</span><strong>把 AI 生成的文档粘贴到这里</strong></div><i className={hasInterestChanges ? "dirty" : ""}>{hasInterestChanges ? "未保存" : "已同步"}</i></div>
          <textarea aria-label="兴趣配置文件" value={content} onChange={(event) => setContent(event.target.value)} placeholder={"把 AI 生成的文档粘贴到这里…\n\n还没有内容？可以先点左侧「填入模板」，或左下角「复制提示词到 AI 工具」。"} spellCheck={false} disabled={busy === "load"} />
          {hasInterestChanges && <section className="interest-diff" aria-label="上次保存与本次内容差异">
            <div className="interest-diff-head"><div><span>上次保存</span><b>→</b><span>本次内容</span></div><p><strong>+{addedInterestLines}</strong> 新增 · <em>−{removedInterestLines}</em> 删除</p></div>
            <div className="interest-diff-body">{interestDiff.map((line, index) => <div className={`interest-diff-line ${line.kind}`} key={`${line.kind}-${line.beforeLine}-${line.afterLine}-${index}`}>
              <span>{line.beforeLine ?? ""}</span><span>{line.afterLine ?? ""}</span><b>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</b><code>{line.text || " "}</code>
            </div>)}</div>
          </section>}
          <div className="interest-file-meta"><span>config/custom/ai/user_interests.txt</span><time>{updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString("zh-CN")}` : "尚未创建"}</time></div>
        </section>
      </div>
      {message && <p className="admin-message">{message}</p>}
    </div>
    <SaveProgressBar state={saveState} elapsed={saveElapsed} />
    <p className="interest-save-hint">保存只写入规则，不触发采集；下一轮定时采集会按新规则筛选。</p>
    <div className="settings-actions interest-actions-bar">
      <button type="button" className="copy-prompt" onClick={copyPrompt}>{copied ? "已复制 ✓" : "复制提示词到 AI 工具"}</button>
      <button className="danger" onClick={() => setConfirmClear(true)} disabled={Boolean(busy) || (!content && !savedContent)}>清空兴趣设置</button>
      <button className="save-button" onClick={save} disabled={Boolean(busy) || !content || !hasInterestChanges || job?.status === "running"}>{busy === "save" ? "保存中…" : "保存"}</button>
    </div>
    {confirmClear && <div className="confirm-backdrop" role="presentation" onClick={() => setConfirmClear(false)}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-label="确认清空兴趣设置" onClick={(event) => event.stopPropagation()}>
        <span className="kicker">清空兴趣设置</span>
        <h3>确定清空全部兴趣规则吗？</h3>
        <p>清空后需要重新配置兴趣设置，才能开始采集与分析。</p>
        <div className="settings-actions">
          <button onClick={() => setConfirmClear(false)}>取消</button>
          <button className="danger" onClick={clearInterests} disabled={busy === "clear"}>{busy === "clear" ? "正在清空…" : "确认清空"}</button>
        </div>
      </div>
    </div>}
  </div>;
}
type SettingsSection = "rss" | "interests";

type RssPlatformConfig = {
  platforms: { enabled: boolean; sources: { id: string; name: string; enabled: boolean }[] };
  rss: { enabled: boolean; feeds: { id: string; name: string; url: string; enabled: boolean }[] };
};

function SettingsPanel({ onClose, onReport, onInterestsCleared }: { onClose: () => void; onReport: (text: string, kind?: StatusReport["kind"]) => void; onInterestsCleared: () => void }) {
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : sessionStorage.getItem("trendradar-admin-token") || "");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [section, setSection] = useState<SettingsSection>("rss");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const request = useCallback(async (path: string, init: RequestInit = {}, suppliedToken = token) => {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (suppliedToken) headers.set("x-trendradar-admin-token", suppliedToken);
    const response = await fetch(`/api/local-admin${path}`, { ...init, headers, cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "请求失败");
    return value;
  }, [token]);

  const load = useCallback(async (suppliedToken = token) => {
    setBusy("load");
    setMessage("");
    try {
      const statusValue = await request("/status", {}, suppliedToken);
      setAuthenticated(Boolean(statusValue.authenticated));
      if (suppliedToken && statusValue.authenticated) sessionStorage.setItem("trendradar-admin-token", suppliedToken);
    } catch (error) {
      setAuthenticated(false);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  }, [request, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(token), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="settings-backdrop" role="presentation" onClick={onClose}>
    <div className="settings-popup" role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => event.stopPropagation()}>
      {authenticated === false
        ? <div className="settings-unlock"><span className="kicker">本地配置保护</span><h2>输入管理口令</h2><p>本机 localhost 访问不需要口令；外部预览写入需要口令。</p><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="TrendRadar Web Admin Token" /><button onClick={() => load(token)} disabled={!token || busy === "load"}>{busy === "load" ? "验证中…" : "进入设置"}</button>{message && <p className="admin-message error">{message}</p>}</div>
        : <>
            <aside className="settings-menu">
              <span className="kicker">设置</span>
              <button className={section === "rss" ? "active" : ""} onClick={() => setSection("rss")}><span>◫</span>RSS 与热榜</button>
              <button className={section === "interests" ? "active" : ""} onClick={() => setSection("interests")}><span>✦</span>兴趣设置</button>
            </aside>
            <section className="settings-body">
              {section === "rss" ? <RssPlatformSettings request={request} onReport={onReport} notify={notify} /> : <InterestSettings request={request} onReport={onReport} notify={notify} onCleared={onInterestsCleared} />}
            </section>
            <button className="settings-close" onClick={onClose} aria-label="关闭设置">×</button>
          </>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </div>;
}

function RssPlatformSettings({ request, onReport, notify }: { request: (path: string, init?: RequestInit) => Promise<any>; onReport: (text: string, kind?: StatusReport["kind"]) => void; notify: (text: string) => void }) {
  const [config, setConfig] = useState<RssPlatformConfig | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<AdminJob | null>(null);
  const { state: saveState, elapsed: saveElapsed, begin: beginSave, stage: stageSave, finish: finishSave, fail: failSave, reset: resetSave } = useSaveProgress();

  const load = useCallback(async () => {
    setBusy("load");
    setMessage("");
    try {
      setConfig(await request("/config"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const value = await request(`/jobs/${job.id}`);
        setJob(value);
        if (value.status === "completed") {
          onReport("配置已生效；下一轮定时采集会读取新配置。", "ok");
          setMessage("已生效");
          notify("已保存，下一轮定时采集读取新配置");
          finishSave("已保存并生效");
        } else if (value.status === "failed") {
          onReport(`生效失败：${value.error || "任务失败"}`, "error");
          setMessage(value.error || "任务失败");
          notify(`生效失败：${value.error || "任务失败"}`);
          failSave(`生效失败：${value.error || "任务失败"}`);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        onReport(`生效失败：${text}`, "error");
        setMessage(text);
        notify(`生效失败：${text}`);
        failSave(`生效失败：${text}`);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, request, onReport, notify, finishSave, failSave]);

  function setPlatformEnabled(enabled: boolean) {
    resetSave();
    setConfig((current) => current ? { ...current, platforms: { ...current.platforms, enabled } } : current);
  }
  function setSourceEnabled(id: string, enabled: boolean) {
    resetSave();
    setConfig((current) => current ? { ...current, platforms: { ...current.platforms, sources: current.platforms.sources.map((s) => s.id === id ? { ...s, enabled } : s) } } : current);
  }
  function setRssEnabled(enabled: boolean) {
    resetSave();
    setConfig((current) => current ? { ...current, rss: { ...current.rss, enabled } } : current);
  }
  function setFeedEnabled(id: string, enabled: boolean) {
    resetSave();
    setConfig((current) => current ? { ...current, rss: { ...current.rss, feeds: current.rss.feeds.map((f) => f.id === id ? { ...f, enabled } : f) } } : current);
  }

  async function save() {
    if (!config) return;
    setBusy("save");
    setMessage("");
    notify("正在保存配置…");
    beginSave();
    try {
      await request("/config", { method: "POST", body: JSON.stringify(config) });
      onReport("正在同步配置到运行副本…", "loading");
      stageSave();
      const value = await request("/actions/deploy", { method: "POST", body: JSON.stringify({}) });
      setJob(value);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      onReport(`保存失败：${text}`, "error");
      setMessage(text);
      notify(`保存失败：${text}`);
      failSave(`保存失败：${text}`);
    } finally { setBusy(""); }
  }

  if (busy === "load" && !config) return <p className="settings-placeholder">正在读取配置…</p>;
  if (!config) return <p className="settings-placeholder">{message || "无法读取配置"}</p>;

  return <div className="settings-section">
    <div className="settings-scroll">
    <div className="settings-section-head"><h2>RSS 与热榜</h2><span className="kicker">数据源开关</span></div>
    <label className="settings-master-toggle"><input type="checkbox" checked={config.platforms.enabled} onChange={(event) => setPlatformEnabled(event.target.checked)} /><span>热榜平台抓取</span></label>
    <div className="settings-toggle-list">
      {config.platforms.sources.map((source) => <label key={source.id} className={config.platforms.enabled ? "" : "disabled"}><input type="checkbox" checked={source.enabled} disabled={!config.platforms.enabled} onChange={(event) => setSourceEnabled(source.id, event.target.checked)} /><span>{source.name}</span></label>)}
    </div>
    <label className="settings-master-toggle"><input type="checkbox" checked={config.rss.enabled} onChange={(event) => setRssEnabled(event.target.checked)} /><span>RSS 订阅</span></label>
    <div className="settings-toggle-list">
      {config.rss.feeds.map((feed) => <label key={feed.id} className={config.rss.enabled ? "" : "disabled"}><input type="checkbox" checked={feed.enabled} disabled={!config.rss.enabled} onChange={(event) => setFeedEnabled(feed.id, event.target.checked)} /><span>{feed.name}</span></label>)}
    </div>
    {message && <p className="admin-message">{message}</p>}
    </div>
    <SaveProgressBar state={saveState} elapsed={saveElapsed} />
    <div className="settings-actions">
      <button onClick={save} disabled={Boolean(busy) || job?.status === "running"}>{busy === "save" ? "保存中…" : "保存并立即生效"}</button>
    </div>
  </div>;
}

function InboxView({
  items,
  access,
  message,
  onToggle,
  onRemove,
}: {
  items: InboxItem[];
  access: InboxAccess;
  message: string;
  onToggle: (item: InboxItem, completed: boolean) => Promise<void>;
  onRemove: (item: InboxItem) => Promise<void>;
}) {
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [busyId, setBusyId] = useState("");
  const pending = items.filter((item) => !item.completedAt);
  const completed = items.filter((item) => Boolean(item.completedAt));
  const visible = tab === "pending" ? pending : completed;

  return <div className="content inbox-page">
    <div className="page-intro inbox-intro"><div><span className="kicker">稍后阅读 · 本机持久化</span><h1>把新闻变成，<br />可以处理的清单。</h1></div><p>每条记录保留 DeepSeek 的进展摘要、原文、所在节点与加入时间。完成后仍留在历史中，随时可以恢复为待办。</p></div>
    <section className="inbox-toolbar">
      <div className="inbox-tabs" role="tablist" aria-label="Inbox 状态">
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")} role="tab" aria-selected={tab === "pending"}>待办 <span>{pending.length}</span></button>
        <button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")} role="tab" aria-selected={tab === "completed"}>已完成 <span>{completed.length}</span></button>
      </div>
      <span>{access === "loading" ? "正在读取…" : `${items.length} 条已保存新闻`}</span>
    </section>
    {message && access === "error" && <p className="inbox-status error">{message}</p>}
    {visible.length === 0 && access !== "loading"
      ? <section className="inbox-empty"><span>{tab === "pending" ? "INBOX ZERO" : "NO ARCHIVE"}</span><h2>{tab === "pending" ? "当前没有待办新闻" : "还没有完成记录"}</h2><p>{tab === "pending" ? "在节点图谱里打开节点，点击新闻右侧的“收进 Inbox”。" : "处理一条待办后，它会带着完成时间出现在这里。"}</p></section>
      : <ol className="inbox-list">{visible.map((item) => <li key={item.id} className={item.completedAt ? "completed" : ""}>
        <div className="inbox-item-index"><span>{typeNames[item.entityType] ?? "节点"}</span><b>{item.entityName}</b></div>
        <article>
          <div className="inbox-item-head"><div><span>{displaySource(item.source)}</span><time>加入 {compactDateTime(item.addedAt)}</time></div></div>
          <h2><a href={item.originalUrl} target="_blank" rel="noreferrer">{item.title}</a></h2>
          <div className="inbox-summary"><span>摘要</span><p>{item.summary}</p></div>
          <footer><div>{item.completedAt ? <time>完成于 {compactDateTime(item.completedAt)}</time> : <span>待处理</span>}</div><div className="inbox-item-actions"><button type="button" disabled={busyId === item.id} onClick={async () => {
            setBusyId(item.id);
            try { await onToggle(item, !item.completedAt); } finally { setBusyId(""); }
          }}>{busyId === item.id ? "保存中…" : item.completedAt ? "恢复待办" : "标记完成"}</button><button type="button" className="danger" disabled={busyId === item.id} onClick={async () => {
            if (!window.confirm("确定从 Inbox 彻底移除这条新闻吗？移除后可从节点侧栏再次收进。")) return;
            setBusyId(item.id);
            try { await onRemove(item); } finally { setBusyId(""); }
          }}>{busyId === item.id ? "保存中…" : "移除"}</button></div></footer>
        </article>
      </li>)}</ol>}
  </div>;
}

function EntityDetail({
  entity,
  playback,
  inboxItems,
  onAddInbox,
  onClose,
}: {
  entity: Entity;
  playback?: PlaybackSelection;
  inboxItems: InboxItem[];
  onAddInbox: (input: InboxInput) => Promise<{ item: InboxItem; created: boolean }>;
  onClose: () => void;
}) {
  const [savingInbox, setSavingInbox] = useState("");
  const [inboxMessage, setInboxMessage] = useState("");
  const focusedNews = useMemo(() => {
    if (!playback) return null;
    const frameStart = playback.frame.start.slice(0, 16);
    const frameEnd = playback.frame.end.slice(0, 16);
    const evidence = entity.timeline.flatMap((event) => event.evidence);
    const supplied = playback.focus?.evidence;
    if (supplied) return { evidence: supplied, inFrame: playback.focus?.inFrame ?? false, event: playback.focus?.event };
    const inFrame = evidence.filter((item) => {
      const moment = evidenceMoment(item);
      return moment >= frameStart && moment <= frameEnd;
    }).sort((left, right) => evidenceMoment(right).localeCompare(evidenceMoment(left)))[0];
    if (inFrame) return { evidence: inFrame, inFrame: true, event: undefined };
    const prior = evidence.filter((item) => evidenceMoment(item) <= frameEnd)
      .sort((left, right) => evidenceMoment(right).localeCompare(evidenceMoment(left)))[0];
    return prior ? { evidence: prior, inFrame: false, event: undefined } : null;
  }, [entity.timeline, playback]);

  const displayTimeline = useMemo(() => {
    if (!focusedNews || entity.timeline.some((event) => event.evidence.some((item) => sameEvidence(item, focusedNews.evidence)))) return entity.timeline;
    const focusEvent = focusedNews.event;
    const synthetic: EntityEvent = {
      id: `playback-${playback?.frame.id}-${entity.id}`,
      name: focusEvent?.name ?? focusedNews.evidence.title,
      type: focusEvent?.type ?? "other",
      changeType: focusEvent?.changeType ?? "other",
      date: focusedNews.evidence.date,
      time: focusedNews.evidence.time,
      timeBasis: focusedNews.evidence.timeBasis,
      publishedAt: focusedNews.evidence.publishedAt,
      observedDate: focusedNews.evidence.observedDate,
      observedAt: focusedNews.evidence.observedAt,
      sourceCount: 1,
      evidenceCount: 1,
      evidence: [focusedNews.evidence],
    };
    return [synthetic, ...entity.timeline].sort((left, right) => eventMoment(right).localeCompare(eventMoment(left)));
  }, [entity.id, entity.timeline, focusedNews, playback?.frame.id]);

  const focusedEventRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!playback || !focusedNews) return;
    const timer = window.setTimeout(() => {
      focusedEventRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [entity.id, focusedNews, playback]);

  return <div className="entity-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="entity-detail">
      <button className="entity-close" onClick={onClose} aria-label="关闭">×</button>
      <span className="entity-type detail-type"><i style={{ background: entity.color }} />{typeNames[entity.type] ?? "节点"}</span>
      <h2>{entity.name}</h2>
      <p className="entity-observed">采集范围 {entity.firstObservedAt.slice(0, 16).replace("T", " ")} — {entity.lastObservedAt.slice(0, 16).replace("T", " ")}</p>
      <div className="entity-detail-metrics">
        <div><span>当前关注度</span><strong>{entity.strength}</strong></div>
        <div><span>新增进展 / 3h</span><strong>{entity.eventChanges3h}</strong></div>
        <div><span>来源扩散 / 3h</span><strong>{entity.spread3h}</strong></div>
        <div><span>累计线索</span><strong>{entity.storyCount}</strong></div>
      </div>
      <HeatTrend entity={entity} />
      {playback && <div className={`playback-focus-summary ${focusedNews ? "" : "empty"}`} role="status">
        <span>{focusedNews?.inFrame ? "该时段进展" : "截至该时间"}</span>
        <div><strong>{playback.frame.label}</strong><small>{focusedNews ? (focusedNews.inFrame ? "已滑动到这个时间片对应的进展" : "该时段没有新的相关线索，已定位到此前最近进展") : "这个时间点之前暂无可定位的进展"}</small></div>
      </div>}
      <section className="entity-detail-section"><div className="entity-section-title"><h3>进展时间线</h3><span>优先按新闻发布时间排列</span></div>
        <ol className="entity-event-list">{displayTimeline.map((event) => {
          const containsFocus = Boolean(focusedNews && event.evidence.some((item) => sameEvidence(item, focusedNews.evidence)));
          return <li ref={containsFocus ? focusedEventRef : undefined} key={event.id} className={containsFocus ? "playback-focus-event" : ""} aria-current={containsFocus ? "true" : undefined}>
          <div className="entity-event-time"><time>{shortDate(event.date)}</time><small>{displayClock(event.time)}</small><em>{event.timeBasis === "published" ? "发布时间" : "采集时间"}</em></div>
          <div><span className="entity-change-type">{changeNames[event.changeType] ?? "新线索"}</span><h4>{event.name}</h4><p>{event.sourceCount} 个来源 · {event.evidenceCount} 条证据{event.timeBasis === "observed" ? " · 原文未提供发布时间" : ""}</p>
            <div className="entity-evidence-list">{event.evidence.slice(0, 4).map((item, index) => {
              const isFocused = Boolean(focusedNews && sameEvidence(item, focusedNews.evidence));
              const saved = inboxItems.some((inboxItem) => isSavedEvidence(inboxItem, item));
              const evidenceKey = `${item.url || item.title}-${item.source}-${item.date}-${item.time}`;
              return <div className={`entity-evidence-row ${isFocused ? "playback-focus-news" : ""}`} key={`${item.title}-${index}`}>
                <a href={item.url || "#"} target="_blank" rel="noreferrer"><span>{displaySource(item.source)}</span>{isFocused && <mark className="playback-news-marker">{focusedNews?.inFrame ? "该时段线索" : "此前线索"}</mark>}{item.title}<small>{item.timeBasis === "published" ? `发布 ${shortDate(item.date)} ${displayClock(item.time)}` : `采集 ${shortDate(item.observedDate)} ${displayClock(item.observedAt)}`}</small></a>
                <button type="button" className={saved ? "saved" : ""} disabled={saved || savingInbox === evidenceKey || !item.url} onClick={async () => {
                  setSavingInbox(evidenceKey);
                  setInboxMessage("");
                  try {
                    const result = await onAddInbox({
                      title: item.title,
                      summary: event.name,
                      originalUrl: item.url,
                      source: item.source,
                      entityId: entity.id,
                      entityName: entity.name,
                      entityType: entity.type,
                      eventId: event.id,
                      eventType: event.type,
                      changeType: event.changeType,
                      publishedAt: item.publishedAt,
                      observedAt: item.observedAt ? `${item.observedDate}T${item.observedAt}` : `${item.observedDate}T${item.time}`,
                    });
                    setInboxMessage(result.created ? "已收进 Inbox" : "这条新闻已经在 Inbox 中");
                  } catch (error) {
                    setInboxMessage(error instanceof Error ? error.message : String(error));
                  } finally { setSavingInbox(""); }
                }}>{saved ? "已收进" : savingInbox === evidenceKey ? "保存中…" : "收进 Inbox"}</button>
              </div>;
            })}</div>
          </div>
        </li>;
        })}</ol>
        {inboxMessage && <p className="entity-inbox-message" role="status">{inboxMessage}</p>}
      </section>
      <section className="entity-detail-section"><div className="entity-section-title"><h3>来源</h3><span>用于验证活跃度</span></div><div className="entity-source-list">{entity.sources.map((source) => <span key={source}>{displaySource(source)}</span>)}</div></section>
    </aside>
  </div>;
}

function NodesEmpty({ searching, query, matched, onClear }: { searching: boolean; query: string; matched: number; onClear: () => void }) {
  if (searching) {
    return <div className="nodes-empty">
      <span>没有匹配</span>
      <h2>没有找到「{query.trim()}」</h2>
      <p>换个关键词试试，或者清空搜索看全部节点。</p>
      <button type="button" onClick={onClear}>清空搜索</button>
    </div>;
  }
  return <div className="nodes-empty">
    <span>等待采集</span>
    <h2>还没有可观测的节点</h2>
    <p>{matched > 0
      ? `本轮有 ${formatNumber(matched)} 条兴趣线索，但还没有抽出可追踪的节点；下一轮采集会重新抽取。`
      : "下一轮采集会按当前兴趣规则筛选新闻，完成后这里才会出现节点。采集按固定节奏运行，完成后刷新本页即可看到结果。"}</p>
  </div>;
}

function EntityRadarWorkspace({ snapshot, view }: { snapshot: Snapshot; view: View }) {
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("全部");
  const [selected, setSelected] = useState<EntitySelection | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxAccess, setInboxAccess] = useState<InboxAccess>("loading");
  const [inboxMessage, setInboxMessage] = useState("");
  const reportStatus = useCallback((text: string, kind: StatusReport["kind"] = "ok") => setStatus({ kind, text }), []);
  const searching = query.trim().length > 0;
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return snapshot.entities.filter((entity) => (entityType === "全部" || entity.type === entityType) && (!needle || [entity.name, ...entity.timeline.map((event) => event.name)].join(" ").toLowerCase().includes(needle))); }, [entityType, query, snapshot.entities]);
  const types = useMemo(() => Array.from(new Set(snapshot.entities.map((entity) => entity.type))).map((type) => ({ type, count: snapshot.entities.filter((entity) => entity.type === type).length })), [snapshot.entities]);
  const eventCount = snapshot.entities.reduce((sum, entity) => sum + entity.timeline.length, 0);
  const pendingInboxCount = inboxItems.filter((item) => !item.completedAt).length;

  const loadInbox = useCallback(async () => {
    setInboxMessage("");
    try {
      const value = await localAdminRequest("/inbox");
      setInboxItems(value.items);
      setInboxAccess("ready");
    } catch (error) {
      setInboxAccess("error");
      setInboxMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { loadInbox().catch(() => {}); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInbox]);

  async function addToInbox(input: InboxInput) {
    const value = await localAdminRequest("/inbox", { method: "POST", body: JSON.stringify(input) });
    const result = value as { item: InboxItem; created: boolean };
    setInboxItems((current) => {
      const remaining = current.filter((item) => item.id !== result.item.id);
      return [result.item, ...remaining];
    });
    return result;
  }

  async function toggleInbox(item: InboxItem, completed: boolean) {
    setInboxMessage("");
    try {
      const value = await localAdminRequest(`/inbox/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      setInboxItems((current) => current.map((candidate) => candidate.id === item.id ? value.item : candidate));
    } catch (error) {
      setInboxMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function removeFromInbox(item: InboxItem) {
    setInboxMessage("");
    try {
      await localAdminRequest(`/inbox/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      setInboxItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (error) {
      setInboxMessage(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  return <main className="app-shell entity-app">
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand"><div className="brand-mark"><span /><i /><b /></div><div><strong>热点观测台</strong></div></div>
      <nav className="main-nav" aria-label="主要视图">
        <Link href="/entities" className={view === "entities" ? "active" : ""} onClick={() => setMobileNav(false)}><span>◫</span>活跃节点<small>{snapshot.meta.entityCount}</small></Link>
        <Link href="/graph" className={view === "graph" ? "active" : ""} onClick={() => setMobileNav(false)}><span>⌘</span>节点关联<small>{snapshot.meta.relationCount}</small></Link>
        <Link href="/inbox" className={view === "inbox" ? "active" : ""} onClick={() => setMobileNav(false)}><span>□</span>Inbox / 待办<small>{inboxAccess === "ready" ? pendingInboxCount : "—"}</small></Link>
      </nav>
      <div className="sidebar-section"><div className="sidebar-section-title"><span>节点类型</span><button onClick={() => setEntityType("全部")}>重置</button></div>
        <button className={`topic-filter ${entityType === "全部" ? "active" : ""}`} onClick={() => setEntityType("全部")}><i className="all-dot" />全部节点<strong>{snapshot.meta.entityCount}</strong></button>
        {types.map((item) => <button className={`topic-filter ${entityType === item.type ? "active" : ""}`} key={item.type} onClick={() => setEntityType(item.type)}><i style={{ background: snapshot.entities.find((entity) => entity.type === item.type)?.color }} />{typeNames[item.type] ?? item.type}<strong>{item.count}</strong></button>)}
      </div>
      <div className="sidebar-snapshot"><span><i /> {snapshot.meta.entityCount > 0 ? "节点抽取完成" : "等待采集"}</span><p>{formatNumber(snapshot.meta.extractedTitles)} 个标题 · {snapshot.meta.entityCount} 个节点</p><small>数据更新至 {snapshot.meta.dataTo} {displayClock(snapshot.meta.latestCrawl)}</small>{status && <small className={`collection-status ${status.kind}`}>{status.text}</small>}</div>
    </aside>
    <section className="workspace">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="打开导航">☰</button>{view !== "inbox" && <div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点" aria-label="搜索节点" /></div>}<div className="topbar-actions"><button className="settings-button" onClick={() => setSettingsOpen(true)} aria-label="打开设置">⚙</button><span className="live-pill"><i /> LIVE</span></div></header>
      {view === "entities" && <div className="content entity-overview">
        <section className="metric-strip"><div><span>节点</span><strong>{snapshot.meta.entityCount}</strong><small>不含宽泛行业词</small></div><div><span>兴趣线索</span><strong>{formatNumber(snapshot.meta.matchedRecords)}</strong><small>由 LLM 预筛选</small></div><div><span>进展</span><strong>{eventCount}</strong><small>优先按新闻发布时间组织</small></div><div><span>节点关联</span><strong>{snapshot.meta.relationCount}</strong><small>来自新闻中的实际共现</small></div></section>
        {filtered.length === 0 ? <NodesEmpty searching={searching} query={query} matched={snapshot.meta.matchedRecords} onClear={() => setQuery("")} /> : <div className="entity-overview-grid"><section><div className="section-heading"><div><h2>节点</h2><p>关注度保留趋势；另外拆出新增进展和来源扩散</p></div><span>{filtered.length} 个节点</span></div><div className="entity-card-list">{filtered.slice(0, 12).map((entity) => <EntityCard entity={entity} onSelect={(item) => setSelected({ entity: item })} key={entity.id} />)}</div></section><section className="entity-graph-panel"><div className="section-heading"><div><h2>互联关系</h2><p>圆圈是关注度，实线外环是新增进展，虚线外环是来源扩散</p></div><Link href="/graph">展开 ↗</Link></div><EntityGraph entities={filtered.slice(0, 18)} edges={snapshot.edges} onSelect={(item) => setSelected({ entity: item })} /></section></div>}
      </div>}
      {view === "graph" && <div className="content entity-page">{filtered.length === 0 ? <NodesEmpty searching={searching} query={query} matched={snapshot.meta.matchedRecords} onClear={() => setQuery("")} /> : <div className="entity-graph-stage"><PlaybackGraph entities={filtered} frames={snapshot.frames} layoutEdges={snapshot.edges} onSelect={(entity, playback) => setSelected({ entity, playback })} /></div>}</div>}
      {view === "inbox" && <InboxView items={inboxItems} access={inboxAccess} message={inboxMessage} onToggle={toggleInbox} onRemove={removeFromInbox} />}
    </section>
    {mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}
    {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} onReport={reportStatus} onInterestsCleared={() => setSettingsOpen(false)} />}    {selected && <EntityDetail entity={selected.entity} playback={selected.playback} inboxItems={inboxItems} onAddInbox={addToInbox} onClose={() => setSelected(null)} />}
  </main>;
}

function FirstUseGuidance({ readiness, onOpenSettings, status }: { readiness: Readiness; onOpenSettings: () => void; status: StatusReport | null }) {
  const missing: string[] = [];
  if (!readiness.interestsValid) missing.push("有效兴趣规则");
  if (!readiness.apiKeySet) missing.push("AI 分析凭据");
  const needsInterests = !readiness.interestsValid;
  return <main className="snapshot-gate guidance-gate">
    <div>
      <span>OBSERVATION DECK · 首次使用</span>
      <h1>先完成配置，<br />再开始采集。</h1>
      <p>“活跃节点”和“节点关联”需要两样东西：一份有效兴趣规则，以及一个可用的 AI 分析凭据。当前缺少：{missing.join("、")}。</p>
      {!readiness.apiKeySet && <p className="gate-hint">AI 分析凭据在项目根目录的 .env 中配置（AI_API_KEY），保存后重启预览即可，无需在页面里填写。</p>}
      <div className="gate-actions">
        {needsInterests && <button onClick={onOpenSettings}>打开设置</button>}
      </div>
      {status && <p className={`collection-status ${status.kind}`}>{status.text}</p>}
    </div>
  </main>;
}

function FirstRunGate({ onStart, job, status }: { onStart: () => void; job: AdminJob | null; status: StatusReport | null }) {
  const running = job?.status === "running";
  return <main className="snapshot-gate first-run-gate">
    <div>
      <span>OBSERVATION DECK · 准备就绪</span>
      <h1>配置完成，<br />开始首次采集。</h1>
      <p>还没有观测快照。开始后将调用 TrendRadar 原生采集流程，完成热榜/RSS 采集、AI 过滤与节点关联抽取；可能按现有设置发送飞书消息。</p>
      <p className="gate-hint">采集与分析大约需要一分钟，请停留在本页不要离开。不点也可以——定时任务会在下一轮自动采集。</p>
      <div className="gate-actions">
        <button onClick={onStart} disabled={running}>{running ? "正在采集与分析…" : "开始采集与分析"}</button>
      </div>
      {status && <p className={`collection-status ${status.kind}`}>{status.text}</p>}
      {running && <pre className="gate-log">{job?.log || "正在启动…"}</pre>}
    </div>
  </main>;
}

function useButtonRipple() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || reduceMotion.matches) return;
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(target instanceof HTMLButtonElement) || target.disabled) return;
      const rect = target.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return;
      // 以点击坐标为圆心：波纹基础直径取按钮宽度，动画缩放到 2.4 倍。
      target.style.setProperty("--ripple-x", `${event.clientX - rect.left}px`);
      target.style.setProperty("--ripple-y", `${event.clientY - rect.top}px`);
      target.style.setProperty("--ripple-size", `${rect.width}px`);
      target.removeAttribute("data-ripple");
      void target.offsetWidth; // 强制回流，让连续点击都能重新触发动画
      target.setAttribute("data-ripple", "run");
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);
}

export default function EntityRadar({ view }: { view: View }) {
  useButtonRipple();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [runJob, setRunJob] = useState<AdminJob | null>(null);
  const reportStatus = useCallback((text: string, kind: StatusReport["kind"] = "ok") => setStatus({ kind, text }), []);

  const loadSnapshot = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/local-admin/entities", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "无法读取观测快照");
      const next = value.snapshot as Snapshot;
      if (!next?.meta?.generatedAt) throw new Error("观测快照格式无效");
      setSnapshot(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  const loadReadiness = useCallback(async () => {
    try {
      const value = await localAdminRequest("/readiness");
      setReadiness({ interestsValid: Boolean(value.interestsValid), apiKeySet: Boolean(value.apiKeySet) });
    } catch {
      setReadiness({ interestsValid: false, apiKeySet: false });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { loadSnapshot(); loadReadiness(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot, loadReadiness]);

  useEffect(() => {
    if (!runJob || runJob.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const value = await localAdminRequest(`/jobs/${runJob.id}`);
        setRunJob(value);
        if (value.status === "completed") {
          reportStatus("首次采集完成，正在加载热点观测台…", "ok");
          window.setTimeout(() => { loadSnapshot(); loadReadiness(); }, 800);
        } else if (value.status === "failed") {
          reportStatus(`采集失败：${value.error || "任务失败"}`, "error");
        }
      } catch (reason) {
        reportStatus(`采集失败：${reason instanceof Error ? reason.message : String(reason)}`, "error");
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [runJob, loadSnapshot, loadReadiness, reportStatus]);

  async function startRun() {
    if (!window.confirm("开始首次采集与分析？可能按现有设置发送飞书消息。")) return;
    reportStatus("正在启动采集与分析，大约需要一分钟，请勿离开本页…", "loading");
    try {
      const value = await localAdminRequest("/actions/run", { method: "POST", body: JSON.stringify({ confirm: "RUN_AND_MAY_PUSH" }) });
      setRunJob(value);
    } catch (reason) {
      reportStatus(`启动失败：${reason instanceof Error ? reason.message : String(reason)}`, "error");
    }
  }

  const ready = Boolean(readiness && readiness.interestsValid && readiness.apiKeySet);

  return <>
    {readiness === null
      ? <main className="snapshot-gate"><div><span>OBSERVATION DECK</span><h1>{error ? "无法读取观测快照" : "正在读取最新观测快照"}</h1><p>{error || "页面只读取运行副本中的唯一节点分析结果。"}</p>{error && <button onClick={loadSnapshot}>重新读取</button>}</div></main>
      : !ready
        ? <FirstUseGuidance readiness={readiness} onOpenSettings={() => setSettingsOpen(true)} status={status} />
        : !snapshot
          ? <FirstRunGate onStart={startRun} job={runJob} status={status} />
          : <EntityRadarWorkspace snapshot={snapshot} view={view} />}
    {settingsOpen && <SettingsPanel onClose={() => { setSettingsOpen(false); loadReadiness(); }} onReport={reportStatus} onInterestsCleared={() => { setSettingsOpen(false); loadReadiness(); }} />}
  </>;
}

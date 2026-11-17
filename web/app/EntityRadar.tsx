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
  incident: "事件",
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
  if (entity.heatTrend === "rising") return entity.heatStreak > 1 ? `连续 ${entity.heatStreak} 日上升` : "热度上升";
  if (entity.heatTrend === "falling") return entity.heatStreak > 1 ? `连续 ${entity.heatStreak} 日下降` : "热度下降";
  return "热度持平";
}

function MiniTrend({ points, color }: { points: StrengthPoint[]; color: string }) {
  const max = Math.max(...points.map((point) => point.strength), 1);
  return <div className="entity-mini-trend" aria-label="实体九天活跃度">
    {points.map((point) => <i key={point.date} title={`${point.date} · ${point.strength}`} style={{ height: `${Math.max(7, point.strength / max * 100)}%`, background: color }} />)}
  </div>;
}

function EntityCard({ entity, onSelect }: { entity: Entity; onSelect: (entity: Entity) => void }) {
  const delta = entity.momentum > 0 ? `+${entity.momentum}` : `${entity.momentum}`;
  return <button className="entity-card" onClick={() => onSelect(entity)} type="button">
    <div className="entity-card-head">
      <span className="entity-type"><i style={{ background: entity.color }} />{typeNames[entity.type] ?? "实体"}</span>
      <span className={`entity-velocity ${entity.heatTrend === "rising" ? "up" : entity.heatTrend === "falling" ? "down" : "flat"}`}>{heatLabel(entity)}</span>
    </div>
    <div className="entity-name-row"><h3>{entity.name}</h3><strong className={entity.momentum >= 0 ? "positive" : "negative"}>{delta}</strong></div>
    <p>{entity.timeline[0]?.name ?? "当前没有识别到新的具体事件"}</p>
    <div className="entity-speed-row">
      <span className="event-speed"><i />事件变化 <b>{entity.eventChanges3h}</b><small>/3h</small></span>
      <span className="spread-speed"><i />媒体扩散 <b>{entity.spread3h}</b><small>源/3h</small></span>
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
    <canvas ref={canvasRef} tabIndex={onStepFrame ? 0 : undefined} aria-label={`实体关系图：节点可拖拽；大小表示热度，黄色实线外环表示事件变化速度，蓝色虚线外环表示媒体扩散速度${onStepFrame ? "；点选图谱后可用左右方向键切换相邻时间帧" : ""}`}
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
      <GraphLegendItem icon="legend-size" label="热度" help="节点大小。使用过去 24 小时滚动强度，由去重标题数、独立来源数、榜单位置和 AI 相关度共同计算。" />
      {showHeatMotion && <><GraphLegendItem icon="legend-previous" label="上帧大小" help="灰色虚线保留前一个 3 小时帧的节点大小，用来直接比较热度变化。" /><GraphLegendItem icon="legend-heat-change" label="热度升降" help="绿色 ↑ 表示较上一帧增强，红色 ↓ 表示减弱；旁边的数字是热度差值。" /></>}
      <GraphLegendItem icon="legend-event" label="新事实" help="当前 3 小时内语义去重后的具体事件数量。媒体重复报道同一件事不会重复增加。" />
      <GraphLegendItem icon="legend-spread" label="新增媒体" help="当前 3 小时内首次加入该实体报道的独立来源数量，同一来源多篇只计算一次。" />
      <GraphLegendItem icon="legend-time" label="时间" help="优先使用新闻发布时间；原文没有发布时间时，才回退到 TrendRadar 首次采集时间。" />
      <span className="graph-drag-hint">{onStepFrame ? "拖拽节点调整位置 · 点选图谱后 ← → 切换时间" : "拖拽节点调整位置"}</span>
    </div>
    {hovered && <div className="entity-graph-tip"><i style={{ background: hovered.color }} /><div><strong>{hovered.name}</strong><span>{showHeatMotion ? `热度 ${hovered.previousStrength} → ${hovered.strength}（${signed(hovered.momentum)}）` : `热度 ${hovered.strength}（${signed(hovered.momentum)}）`} · 新事实 {hovered.eventChanges3h} · 新增媒体 {hovered.spread3h}</span></div></div>}
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

  if (!frame) return <p>暂无可播放的时间帧。</p>;
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
      <div><span>播放日期区间</span><strong>选择范围后，只播放范围内的 3 小时帧</strong></div>
      <label><span>开始日期</span><input type="date" min={availableStart} max={rangeEnd || availableEnd} value={rangeStart} onChange={(event) => updateRange(event.target.value, event.target.value > rangeEnd ? event.target.value : rangeEnd)} /></label>
      <i>—</i>
      <label><span>结束日期</span><input type="date" min={rangeStart || availableStart} max={availableEnd} value={rangeEnd} onChange={(event) => updateRange(event.target.value < rangeStart ? event.target.value : rangeStart, event.target.value)} /></label>
      <button type="button" onClick={() => updateRange(availableStart, availableEnd)}>全部日期</button>
    </div>
    <div className="graph-player-status">
      <div><span className="graph-player-kicker">当前时间帧 · {frameIndex + 1}/{playbackFrames.length}</span><strong>{frame.label}</strong><small>{rangeStart} 至 {rangeEnd} · 共 {playbackFrames.length} 帧 · {frame.sparse ? "本帧数据较稀疏" : `${frame.storyCount} 条线索 · ${frame.sourceCount} 个来源`} · {frame.publishedCount} 条发布时间 · {frame.observedFallbackCount} 条观测时间</small></div>
      <div className="graph-frame-metrics"><span><b>{activeEntities}</b> 活跃实体</span><span><b>{newFacts}</b> 新事实</span><span><b>{newMedia}</b> 新增媒体</span></div>
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
      <label className="graph-scrubber"><span className="sr-only">选择三小时时间帧</span><input type="range" min="0" max={Math.max(0, playbackFrames.length - 1)} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} /></label>
      <label className="graph-speed"><span>速度</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select></label>
      <label className="graph-color-toggle"><input type="checkbox" checked={colorByType} onChange={(event) => setColorByType(event.target.checked)} /><i /><span>按实体类型着色</span></label>
    </div>
  </section>;
}

function HeatTrend({ entity }: { entity: Entity }) {
  const points = entity.strengthTimeline;
  const max = Math.max(...points.map((point) => point.strength), 1);
  const latest = points[points.length - 1]?.strength ?? 0;
  const peak = Math.max(...points.map((point) => point.strength), 0);
  return <section className="entity-detail-section entity-heat-section">
    <div className="entity-section-title"><div><h3>热度变化</h3><small>按天展示最近 {points.length} 天强度</small></div><span>当前 {latest}</span></div>
    <div className="entity-heat-summary"><span><b>{latest}</b> 当前热度</span><span><b>{peak}</b> 区间峰值</span></div>
    <div className="entity-heat-chart" role="img" aria-label={`${entity.name} 最近 ${points.length} 天热度变化，当前 ${latest}，区间峰值 ${peak}`}>
      {points.map((point) => <div className="entity-heat-column" key={point.date}><strong>{point.strength}</strong><div><i style={{ height: `${point.strength > 0 ? Math.max(8, point.strength / max * 100) : 2}%`, background: entity.color }} /></div><time>{shortDate(point.date)}</time></div>)}
    </div>
  </section>;
}

function InterestSettings() {
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : sessionStorage.getItem("trendradar-admin-token") || "");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<AdminJob | null>(null);
  const interestDiff = useMemo(() => buildInterestDiff(savedContent, content), [content, savedContent]);
  const hasInterestChanges = normalizedInterestText(content) !== normalizedInterestText(savedContent);
  const addedInterestLines = interestDiff.filter((line) => line.kind === "add").length;
  const removedInterestLines = interestDiff.filter((line) => line.kind === "remove").length;

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
      const status = await request("/status", {}, suppliedToken);
      setAuthenticated(Boolean(status.authenticated));
      if (!status.authenticated) return;
      const value = await request("/interests", {}, suppliedToken);
      setContent(value.content);
      setSavedContent(value.content);
      setUpdatedAt(value.updatedAt);
      if (suppliedToken) sessionStorage.setItem("trendradar-admin-token", suppliedToken);
    } catch (error) {
      setAuthenticated(false);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(""); }
  }, [request, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(token), 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = window.setInterval(async () => {
      try {
        const value = await request(`/jobs/${job.id}`);
        setJob(value);
        if (value.status === "completed") {
          setMessage(value.kind === "deploy" ? "检查通过，配置已同步到运行副本；下一轮定时采集会读取新规则。" : "立即采集完成，实体雷达快照已更新。");
          if (value.kind === "run") window.setTimeout(() => window.location.reload(), 2200);
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, request]);

  async function save(showMessage = true) {
    const value = await request("/interests", { method: "POST", body: JSON.stringify({ content }) });
    setSavedContent(content.endsWith("\n") ? content : `${content}\n`);
    setUpdatedAt(value.updatedAt);
    if (showMessage) setMessage("草稿已保存到工作区；尚未同步到后台运行副本。");
  }

  async function suggest() {
    if (!instruction.trim()) return;
    setBusy("suggest");
    setMessage("");
    try {
      const value = await request("/interests/suggest", { method: "POST", body: JSON.stringify({ instruction, current: content }) });
      setContent(value.content);
      setMessage(value.summary);
      setInstruction("");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  }

  async function startAction(kind: AdminJob["kind"]) {
    if (kind === "run" && !window.confirm("立即运行会调用 TrendRadar 原生采集流程，并可能按现有设置发送飞书消息。确认继续吗？")) return;
    setBusy(kind);
    setMessage("");
    try {
      if (content !== savedContent) await save(false);
      const value = await request(`/actions/${kind}`, { method: "POST", body: JSON.stringify(kind === "run" ? { confirm: "RUN_AND_MAY_PUSH" } : {}) });
      setJob(value);
      setMessage(kind === "deploy" ? "正在保存、检查并同步配置…" : "正在保存、检查、同步并立即采集…");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(""); }
  }

  if (authenticated === false) return <div className="content interest-page"><section className="admin-unlock"><span className="kicker">本地配置保护</span><h1>输入管理口令，<br />才能修改采集规则。</h1><p>外部预览可以查看图谱，但写入本机文件和启动任务需要管理口令。本机 localhost 访问不需要口令。</p><label><span>管理口令</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="TrendRadar Web Admin Token" /></label><button onClick={() => load(token)} disabled={!token || busy === "load"}>{busy === "load" ? "验证中…" : "进入兴趣设置"}</button>{message && <p className="admin-message error">{message}</p>}</section></div>;

  return <div className="content interest-page">
    <div className="page-intro interest-intro"><div><span className="kicker">原生配置入口</span><h1>告诉 DeepSeek，<br />你现在想看什么。</h1></div><p>这里直接读写 TrendRadar 现有的兴趣文件。保存不会另建规则库；检查、同步和采集也全部调用开源项目原来的流程。</p></div>
    <section className="interest-workbench">
      <div className="interest-chat">
        <div className="interest-panel-head"><div><span>LLM 配置助手</span><strong>用自然语言修改现有规则</strong></div><i>DEEPSEEK</i></div>
        <div className="interest-conversation"><div className="assistant-bubble"><span>助手</span><p>你可以说：“增加对 Kimi 和月之暗面的关注，但排除只有观点、没有新事实的讨论。”我会保留其他规则，只生成一份待确认的完整草案。</p></div>{message && <div className="system-bubble"><span>状态</span><p>{message}</p></div>}</div>
        <div className="interest-prompt"><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="描述要增加、删除或调整的兴趣…" /><button onClick={suggest} disabled={!instruction.trim() || Boolean(busy) || Boolean(job?.status === "running")}>{busy === "suggest" ? "整理中…" : "生成修改草案"}</button></div>
      </div>
      <div className="interest-editor">
        <div className="interest-panel-head"><div><span>user_interests.txt</span><strong>项目当前实际读取的配置</strong></div><i className={hasInterestChanges ? "dirty" : ""}>{hasInterestChanges ? "未保存" : "已同步编辑器"}</i></div>
        <textarea aria-label="兴趣配置文件" value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} disabled={authenticated === null} />
        {hasInterestChanges && <section className="interest-diff" aria-label="兴趣配置修改前后对比">
          <div className="interest-diff-head"><div><span>修改前</span><b>→</b><span>修改后</span></div><p><strong>+{addedInterestLines}</strong> 新增 · <em>−{removedInterestLines}</em> 删除</p></div>
          <div className="interest-diff-body">{interestDiff.map((line, index) => <div className={`interest-diff-line ${line.kind}`} key={`${line.kind}-${line.beforeLine}-${line.afterLine}-${index}`}>
            <span>{line.beforeLine ?? ""}</span><span>{line.afterLine ?? ""}</span><b>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}</b><code>{line.text || " "}</code>
          </div>)}</div>
        </section>}
        <div className="interest-file-meta"><span>config/custom/ai/user_interests.txt</span><time>{updatedAt ? `更新于 ${new Date(updatedAt).toLocaleString("zh-CN")}` : "正在读取…"}</time></div>
      </div>
    </section>
    <section className="interest-actions">
      <div><span>1</span><strong>保存草稿</strong><p>只写回工作区文件，尚未同步到后台运行副本。</p><button onClick={() => save()} disabled={Boolean(busy) || !content || !hasInterestChanges}>保存草稿</button></div>
      <div><span>2</span><strong>检查并生效</strong><p>自动保存、检查配置并同步；下一轮定时采集读取。</p><button onClick={() => startAction("deploy")} disabled={Boolean(busy) || Boolean(job?.status === "running")}>检查并生效</button></div>
      <div className="run-action"><span>3</span><strong>保存并立即运行</strong><p>自动完成前两步并立即采集；可能发送飞书消息。</p><button onClick={() => startAction("run")} disabled={Boolean(busy) || Boolean(job?.status === "running")}>立即运行…</button></div>
    </section>
    {job && <section className={`job-console ${job.status}`}><div><span>{job.status === "running" ? "任务执行中" : job.status === "completed" ? "任务已完成" : "任务失败"}</span><strong>{job.kind === "deploy" ? "保存、检查与生效" : "保存并立即运行"}</strong></div><pre>{job.log || "正在启动…"}</pre></section>}
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
    <div className="page-intro inbox-intro"><div><span className="kicker">稍后阅读 · 本机持久化</span><h1>把新闻变成，<br />可以处理的清单。</h1></div><p>每条记录保留 DeepSeek 的事件总结、原文、所在实体节点与加入时间。完成后仍留在历史中，随时可以恢复为待办。</p></div>
    <section className="inbox-toolbar">
      <div className="inbox-tabs" role="tablist" aria-label="Inbox 状态">
        <button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")} role="tab" aria-selected={tab === "pending"}>待办 <span>{pending.length}</span></button>
        <button className={tab === "completed" ? "active" : ""} onClick={() => setTab("completed")} role="tab" aria-selected={tab === "completed"}>已完成 <span>{completed.length}</span></button>
      </div>
      <span>{access === "loading" ? "正在读取…" : `${items.length} 条已保存新闻`}</span>
    </section>
    {message && access === "error" && <p className="inbox-status error">{message}</p>}
    {visible.length === 0 && access !== "loading"
      ? <section className="inbox-empty"><span>{tab === "pending" ? "INBOX ZERO" : "NO ARCHIVE"}</span><h2>{tab === "pending" ? "当前没有待办新闻" : "还没有完成记录"}</h2><p>{tab === "pending" ? "在实体关系图里打开节点，点击新闻右侧的“收进 Inbox”。" : "处理一条待办后，它会带着完成时间出现在这里。"}</p></section>
      : <ol className="inbox-list">{visible.map((item) => <li key={item.id} className={item.completedAt ? "completed" : ""}>
        <div className="inbox-item-index"><span>{typeNames[item.entityType] ?? "实体"}</span><b>{item.entityName}</b></div>
        <article>
          <div className="inbox-item-head"><div><span>{displaySource(item.source)}</span><time>加入 {compactDateTime(item.addedAt)}</time></div><a href={item.originalUrl} target="_blank" rel="noreferrer">原文 ↗</a></div>
          <h2>{item.title}</h2>
          <div className="inbox-summary"><span>摘要</span><p>{item.summary}</p></div>
          <footer><div>{item.completedAt ? <time>完成于 {compactDateTime(item.completedAt)}</time> : <span>待处理</span>}</div><div className="inbox-item-actions"><button type="button" disabled={busyId === item.id} onClick={async () => {
            setBusyId(item.id);
            try { await onToggle(item, !item.completedAt); } finally { setBusyId(""); }
          }}>{busyId === item.id ? "保存中…" : item.completedAt ? "恢复待办" : "标记完成"}</button><button type="button" className="danger" disabled={busyId === item.id} onClick={async () => {
            if (!window.confirm("确定从 Inbox 彻底移除这条新闻吗？移除后可从实体侧栏再次收进。")) return;
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
      <span className="entity-type detail-type"><i style={{ background: entity.color }} />{typeNames[entity.type] ?? "实体"}</span>
      <h2>{entity.name}</h2>
      <p className="entity-observed">采集范围 {entity.firstObservedAt.slice(0, 16).replace("T", " ")} — {entity.lastObservedAt.slice(0, 16).replace("T", " ")}</p>
      <div className="entity-detail-metrics">
        <div><span>当前热度</span><strong>{entity.strength}</strong></div>
        <div><span>事件变化 / 3h</span><strong>{entity.eventChanges3h}</strong></div>
        <div><span>媒体扩散 / 3h</span><strong>{entity.spread3h}</strong></div>
        <div><span>累计线索</span><strong>{entity.storyCount}</strong></div>
      </div>
      <HeatTrend entity={entity} />
      {playback && <div className={`playback-focus-summary ${focusedNews ? "" : "empty"}`} role="status">
        <span>{focusedNews?.inFrame ? "该时段事件" : "截至该时间"}</span>
        <div><strong>{playback.frame.label}</strong><small>{focusedNews ? (focusedNews.inFrame ? "已滑动到这个时间帧对应的事件" : "该时段没有新的相关线索，已定位到此前最近事件") : "这个时间点之前暂无可定位的事件"}</small></div>
      </div>}
      <section className="entity-detail-section"><div className="entity-section-title"><h3>事件演化</h3><span>优先按新闻发布时间排列</span></div>
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

function EntityRadarWorkspace({ snapshot, view }: { snapshot: Snapshot; view: View }) {
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("全部");
  const [selected, setSelected] = useState<EntitySelection | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxAccess, setInboxAccess] = useState<InboxAccess>("loading");
  const [inboxMessage, setInboxMessage] = useState("");

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
      <div className="brand"><div className="brand-mark"><span /><i /><b /></div><div><strong>实体雷达</strong><small>TrendRadar Graph</small></div></div>
      <nav className="main-nav" aria-label="主要视图">
        <Link href="/entities" className={view === "entities" ? "active" : ""} onClick={() => setMobileNav(false)}><span>◫</span>活跃实体<small>{snapshot.meta.entityCount}</small></Link>
        <Link href="/graph" className={view === "graph" ? "active" : ""} onClick={() => setMobileNav(false)}><span>⌘</span>实体关系<small>{snapshot.meta.relationCount}</small></Link>
        <Link href="/interests" className={view === "interests" ? "active" : ""} onClick={() => setMobileNav(false)}><span>✦</span>兴趣设置<small>LLM</small></Link>
        <Link href="/inbox" className={view === "inbox" ? "active" : ""} onClick={() => setMobileNav(false)}><span>□</span>Inbox / 待办<small>{inboxAccess === "ready" ? pendingInboxCount : "—"}</small></Link>
      </nav>
      <div className="sidebar-section"><div className="sidebar-section-title"><span>实体类型</span><button onClick={() => setEntityType("全部")}>重置</button></div>
        <button className={`topic-filter ${entityType === "全部" ? "active" : ""}`} onClick={() => setEntityType("全部")}><i className="all-dot" />全部实体<strong>{snapshot.meta.entityCount}</strong></button>
        {types.map((item) => <button className={`topic-filter ${entityType === item.type ? "active" : ""}`} key={item.type} onClick={() => setEntityType(item.type)}><i style={{ background: snapshot.entities.find((entity) => entity.type === item.type)?.color }} />{typeNames[item.type] ?? item.type}<strong>{item.count}</strong></button>)}
      </div>
      <div className="sidebar-snapshot"><span><i /> LLM 实体抽取完成</span><p>{formatNumber(snapshot.meta.extractedTitles)} 个标题 · {snapshot.meta.entityCount} 个实体</p><small>数据更新至 {snapshot.meta.dataTo} {displayClock(snapshot.meta.latestCrawl)}</small></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="打开导航">☰</button><div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Kimi、英伟达、GPT 或具体事件…" /><kbd>⌘ K</kbd></div><div className="topbar-actions"><span className="live-pill"><i /> ENTITY</span></div></header>
      {view === "entities" && <div className="content entity-overview">
        <section className="metric-strip"><div><span>具体实体</span><strong>{snapshot.meta.entityCount}</strong><small>不含宽泛行业词</small></div><div><span>兴趣线索</span><strong>{formatNumber(snapshot.meta.matchedRecords)}</strong><small>由 LLM 预筛选</small></div><div><span>事件节点</span><strong>{eventCount}</strong><small>优先按新闻发布时间组织</small></div><div><span>实体关系</span><strong>{snapshot.meta.relationCount}</strong><small>来自新闻中的实际共现</small></div></section>
        <div className="entity-overview-grid"><section><div className="section-heading"><div><h2>具体实体</h2><p>热度保留趋势；另外拆出事件变化和媒体扩散</p></div><span>{filtered.length} 个实体</span></div><div className="entity-card-list">{filtered.slice(0, 12).map((entity) => <EntityCard entity={entity} onSelect={(item) => setSelected({ entity: item })} key={entity.id} />)}</div></section><section className="entity-graph-panel"><div className="section-heading"><div><h2>互联关系</h2><p>圆圈是热度，实线外环是事件变化，虚线外环是媒体扩散</p></div><Link href="/graph">展开 ↗</Link></div><EntityGraph entities={filtered.slice(0, 18)} edges={snapshot.edges} onSelect={(item) => setSelected({ entity: item })} /></section></div>
      </div>}
      {view === "graph" && <div className="content entity-page"><div className="entity-graph-stage"><PlaybackGraph entities={filtered} frames={snapshot.frames} layoutEdges={snapshot.edges} onSelect={(entity, playback) => setSelected({ entity, playback })} /></div></div>}
      {view === "interests" && <InterestSettings />}
      {view === "inbox" && <InboxView items={inboxItems} access={inboxAccess} message={inboxMessage} onToggle={toggleInbox} onRemove={removeFromInbox} />}
    </section>
    {mobileNav && <button className="mobile-overlay" onClick={() => setMobileNav(false)} aria-label="关闭导航" />}
    {selected && <EntityDetail entity={selected.entity} playback={selected.playback} inboxItems={inboxItems} onAddInbox={addToInbox} onClose={() => setSelected(null)} />}
  </main>;
}

export default function EntityRadar({ view }: { view: View }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  const loadSnapshot = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/local-admin/entities", { cache: "no-store" });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "无法读取实体快照");
      const next = value.snapshot as Snapshot;
      if (!next?.meta?.generatedAt) throw new Error("实体快照格式无效");
      setSnapshot(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadSnapshot, 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  if (!snapshot) return <main className="snapshot-gate"><div><span>ENTITY RADAR</span><h1>{error ? "无法读取实体快照" : "正在读取最新实体快照"}</h1><p>{error || "页面只读取运行副本中的唯一节点分析结果。"}</p>{error && <button onClick={loadSnapshot}>重新读取</button>}</div></main>;
  return <EntityRadarWorkspace snapshot={snapshot} view={view} />;
}

import { coupleCalendar, roomToday } from "./core/dates.js";
import { defaultZone, isPreviewStart, previewPath, readSelection, zones } from "./core/preview.js";
import {
  SKETCH_H, SKETCH_W, drawSmoothPath, groupSketchPaths, isSketchBg, isSketchToken,
  isValidSketchStroke, renderSketchScene, sketchBgHex, sketchBgs, sketchColors, sketchStamps,
} from "./core/sketch.js";
import { webOrigin } from "./origin.js";

// Korean for Korean browsers, English for everyone else (the popup cannot read the web app's language cookie).
const lang = (navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
const words = {
  ko: {
    title: "둘이 · 기념일", brand: "둘이", full: "전체 웹앱 ↗", result: "기념일 계산 결과", today: "오늘", annual: "연애 기념일",
    settings: "날짜 설정", start: "함께한 첫날", zone: "기준 시간대", remember: "이 기기에 날짜와 시간대 기억",
    pick: "첫날을 골라 주세요", untilStart: "첫날까지", milestone: "오늘은 우리의 기념일", together: "함께한 지", days: "일째",
    hundred: (n) => "우리의 " + n + "일", todayShort: "오늘",
    saveFailed: "이 기기에 설정을 저장하지 못했어요.", openFailed: "웹앱을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.",
    loadFailed: "저장한 날짜를 불러오지 못했어요. 직접 입력해 주세요.",
    zones: { "America/Vancouver": "밴쿠버", "America/Toronto": "토론토", "Asia/Seoul": "서울" },
    modesLabel: "기능 전환", tabDays: "기념일", tabDraw: "함께 그리기",
    openStudio: "큰 화면 ↗", canvasLabel: "함께 그리기 캔버스", toolLabel: "도구", sizeLabel: "굵기",
    colorLabel: "색상", stampLabel: "스티커", bgLabel: "배경색",
    toolPen: "펜", toolErase: "지우개", toolStamp: "스티커", undo: "되돌리기", clear: "지우기",
    offlineNote: "● 로컬 낙서", syncedWith: (n) => `● ${n || "상대"}와 연결됨`,
    pairHint: "둘이 방과 연결하면 상대와 실시간으로 같이 그려요.",
    connectRoom: "방 연결하기 ↗", pasteCode: "연결 코드 직접 입력", codePlaceholder: "64자리 코드 붙여넣기", saveCode: "연결",
    disconnect: "연결 해제", badCode: "올바른 64자리 연결 코드를 입력해 주세요.",
    authExpired: "방 연결이 만료됐어요. 다시 연결해 주세요.", syncFailed: "그림을 불러오지 못했어요.",
  },
  en: {
    title: "Duri · Anniversaries", brand: "Duri", full: "Full web app ↗", result: "Anniversary count", today: "Today", annual: "Anniversary",
    settings: "Date settings", start: "Our first day", zone: "Time zone", remember: "Remember the date and time zone on this device",
    pick: "Pick your first day", untilStart: "Until our first day", milestone: "Today is our anniversary", together: "Together for", days: "days",
    hundred: (n) => "Our day " + n, todayShort: "Today",
    saveFailed: "Could not save the settings on this device.", openFailed: "Could not open the web app. Please try again shortly.",
    loadFailed: "Could not load the saved date. Please enter it again.",
    zones: { "America/Vancouver": "Vancouver", "America/Toronto": "Toronto", "Asia/Seoul": "Seoul" },
    modesLabel: "Mode", tabDays: "Anniversaries", tabDraw: "Draw together",
    openStudio: "Full studio ↗", canvasLabel: "Shared drawing canvas", toolLabel: "Tool", sizeLabel: "Size",
    colorLabel: "Color", stampLabel: "Stickers", bgLabel: "Background",
    toolPen: "Pen", toolErase: "Eraser", toolStamp: "Sticker", undo: "Undo", clear: "Clear",
    offlineNote: "● Local doodle", syncedWith: (n) => `● Synced with ${n || "partner"}`,
    pairHint: "Connect your Duri room to draw live with your partner.",
    connectRoom: "Connect room ↗", pasteCode: "Paste pairing code", codePlaceholder: "64-char pairing code", saveCode: "Connect",
    disconnect: "Disconnect", badCode: "Please enter a valid 64-character code.",
    authExpired: "Room pairing expired. Please reconnect from Duri.", syncFailed: "Could not sync the drawing.",
  },
}[lang];

document.documentElement.lang = lang;
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = words[el.dataset.i18n];
for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", words[el.dataset.i18nLabel]);
for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.setAttribute("placeholder", words[el.dataset.i18nPlaceholder]);
const num = (n) => n.toLocaleString(lang === "ko" ? "ko-KR" : "en-CA");

const start = document.querySelector("#start");
const zone = document.querySelector("#zone");
const remember = document.querySelector("#remember");
const $ = (id) => document.querySelector("#" + id);
const count = $("count");
const errorEl = document.querySelector("#error");

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}
function clearError() {
  errorEl.hidden = true;
}

// ---------------------------------------------------------------- Anniversaries tab
function render() {
  const today = roomToday(new Date(), zone.value);
  $("today").textContent = today.replaceAll("-", ". ");
  $("big").hidden = true;
  $("rows").hidden = true;
  if (!isPreviewStart(start.value)) {
    $("caption").textContent = words.pick;
    $("settings").open = true;
    return;
  }
  const result = coupleCalendar(start.value, today);
  $("big").hidden = false;
  if (result.status === "upcoming") {
    $("caption").textContent = words.untilStart;
    count.textContent = "D−" + result.daysToStart;
    $("unit").textContent = "";
    return;
  }
  $("caption").textContent = result.milestoneToday ? words.milestone : words.together;
  count.textContent = num(result.day);
  $("unit").textContent = words.days;
  $("rows").hidden = false;
  $("hundred-label").textContent = words.hundred(num(result.nextHundred));
  $("hundred-left").textContent = "D−" + result.daysUntilHundred;
  $("hundred-date").textContent = result.hundredDate;
  $("annual-left").textContent = result.daysUntilAnnual === 0 ? words.todayShort : "D−" + result.daysUntilAnnual;
  $("annual-date").textContent = result.annual;
}

let writes = Promise.resolve();
function saveChoice() {
  const fields = new URLSearchParams({ start: start.value, zone: zone.value }).toString();
  const keep = remember.checked && readSelection(fields) !== null;
  writes = writes.then(() => keep
    ? chrome.storage.local.set({ calendarPreview: fields })
    : chrome.storage.local.remove("calendarPreview")
  ).catch(() => showError(words.saveFailed));
}

async function openUrl(path) {
  const url = new URL(path, webOrigin).href;
  try {
    await writes;
    await chrome.tabs.create({ url });
    window.close();
  } catch {
    showError(words.openFailed);
  }
}

// ---------------------------------------------------------------- Shared Draw tab
const canvas = $("sketch-canvas");
const canvasCtx = canvas.getContext("2d");
const frame = $("canvas-frame");
const syncPill = $("sync-pill");

const sketch = {
  tool: "pen",
  color: sketchColors[0],
  size: 9,
  stamp: sketchStamps[0],
  bg: "paper",
  strokes: [],
  pending: [],
  pen: null,
  revision: 0,
  latestSeq: 0,
  bridge: null, // { token, origin, partnerName }
  queue: Promise.resolve(),
  flushTimer: 0,
  pollTimer: 0,
  raf: 0,
  activeTab: "days",
};

function parseBridge(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return typeof raw === "object" ? raw : null;
}

function scheduleCanvasDraw() {
  if (sketch.raf) return;
  sketch.raf = requestAnimationFrame(() => {
    sketch.raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(SKETCH_W * dpr);
    const h = Math.round(SKETCH_H * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const seen = new Set(sketch.strokes.map((r) => r.segment));
    const combined = [...sketch.strokes, ...sketch.pending.filter((r) => !seen.has(r.segment))];
    renderSketchScene(canvasCtx, groupSketchPaths(combined));
    if (sketch.pen) {
      drawSmoothPath(canvasCtx, sketch.pen.points, sketch.pen.color, sketch.pen.width, sketch.pen.kind === "erase");
    }
  });
}

function updateBgUi(nextBg) {
  sketch.bg = nextBg;
  frame.style.backgroundColor = sketchBgHex[nextBg];
  for (const btn of document.querySelectorAll(".bg-dot")) {
    btn.setAttribute("aria-checked", String(btn.dataset.bg === nextBg));
  }
}

function updatePairingUi() {
  const paired = Boolean(sketch.bridge?.token);
  $("unpaired-view").hidden = paired;
  $("paired-view").hidden = !paired;
  syncPill.dataset.live = paired ? "on" : "off";
  syncPill.textContent = paired ? words.syncedWith(sketch.bridge.partnerName) : words.offlineNote;
}

async function apiGet(sinceSeq = 0, sinceRev = null) {
  if (!sketch.bridge) return;
  const origin = sketch.bridge.origin || webOrigin;
  const url = new URL("/api/sketch", origin);
  if (sinceSeq > 0 && sinceRev !== null) {
    url.searchParams.set("sinceSeq", String(sinceSeq));
    url.searchParams.set("sinceRev", String(sinceRev));
  }
  const res = await fetch(url.href, {
    headers: { Authorization: "Bearer " + sketch.bridge.token },
    cache: "no-store",
  });
  if (res.status === 401) {
    await disconnectBridge(words.authExpired);
    return;
  }
  if (!res.ok) throw new Error("fetch");
  const data = await res.json();
  applyRemoteState(data);
}

async function apiPost(body) {
  if (!sketch.bridge) return null;
  const origin = sketch.bridge.origin || webOrigin;
  const res = await fetch(new URL("/api/sketch", origin).href, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + sketch.bridge.token,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await disconnectBridge(words.authExpired);
    return null;
  }
  if (!res.ok) throw new Error("post");
  return res.json();
}

function applyRemoteState(data) {
  if (!data) return;
  sketch.revision = data.revision ?? sketch.revision;
  sketch.latestSeq = data.latestSeq ?? sketch.latestSeq;
  if (isSketchBg(data.bg)) updateBgUi(data.bg);
  if (data.incremental) {
    const incoming = Array.isArray(data.strokes) ? data.strokes : [];
    if (incoming.length > 0) {
      const have = new Set(sketch.strokes.map((r) => r.segment));
      const add = incoming.filter((r) => !have.has(r.segment));
      if (add.length > 0) {
        const addedIds = new Set(add.map((r) => r.segment));
        sketch.pending = sketch.pending.filter((p) => !addedIds.has(p.segment));
        sketch.strokes.push(...add);
      }
    }
  } else if (Array.isArray(data.strokes)) {
    const serverIds = new Set(data.strokes.map((r) => r.segment));
    sketch.pending = sketch.pending.filter((p) => !serverIds.has(p.segment));
    sketch.strokes = data.strokes;
  }
  scheduleCanvasDraw();
}

function enqueueSketch(job) {
  sketch.queue = sketch.queue.then(job).catch(() => undefined);
  return sketch.queue;
}

function flushPen() {
  const pen = sketch.pen;
  if (!pen) return;
  while (pen.sent < pen.points.length) {
    const startIdx = Math.max(0, pen.sent - 1);
    const chunk = pen.points.slice(startIdx, startIdx + 250);
    if (chunk.length === 1 && pen.sent > 0) break;
    pen.sent = startIdx + chunk.length;
    if (!isValidSketchStroke(pen.kind, chunk, pen.color, pen.width, null)) continue;
    const segmentId = crypto.randomUUID();
    const row = {
      seq: 1e15 + sketch.pending.length,
      stroke: pen.id,
      segment: segmentId,
      by: "me",
      kind: pen.kind,
      color: pen.color,
      width: pen.width,
      points: chunk,
      stamp: null,
    };
    if (sketch.bridge) {
      sketch.pending.push(row);
      enqueueSketch(async () => {
        try {
          await apiPost({
            action: "stroke",
            strokeId: pen.id,
            segmentId,
            kind: pen.kind,
            color: pen.color,
            width: pen.width,
            points: chunk,
          });
        } catch {
          showError(words.syncFailed);
        }
      });
    } else {
      sketch.strokes.push(row);
    }
  }
}

function toBoardPoint(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * SKETCH_W;
  const y = ((e.clientY - rect.top) / rect.height) * SKETCH_H;
  return [
    Math.round(Math.min(SKETCH_W, Math.max(0, x)) * 10) / 10,
    Math.round(Math.min(SKETCH_H, Math.max(0, y)) * 10) / 10,
  ];
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  clearError();
  const pt = toBoardPoint(e);
  if (sketch.tool === "stamp") {
    const strokeId = crypto.randomUUID();
    const segmentId = crypto.randomUUID();
    const row = {
      seq: 1e15 + sketch.pending.length,
      stroke: strokeId,
      segment: segmentId,
      by: "me",
      kind: "stamp",
      color: "#2a1f26",
      width: 44,
      points: [pt],
      stamp: sketch.stamp,
    };
    if (sketch.bridge) {
      sketch.pending.push(row);
      scheduleCanvasDraw();
      enqueueSketch(async () => {
        try {
          await apiPost({
            action: "stroke",
            strokeId,
            segmentId,
            kind: "stamp",
            color: "#2a1f26",
            width: 44,
            points: [pt],
            stamp: sketch.stamp,
          });
        } catch {
          showError(words.syncFailed);
        }
      });
    } else {
      sketch.strokes.push(row);
      scheduleCanvasDraw();
    }
    return;
  }

  canvas.setPointerCapture(e.pointerId);
  const penWidth = sketch.tool === "erase" ? Math.max(18, sketch.size * 2) : sketch.size;
  sketch.pen = {
    id: crypto.randomUUID(),
    kind: sketch.tool === "erase" ? "erase" : "pen",
    color: sketch.color,
    width: penWidth,
    points: [pt],
    sent: 0,
  };
  clearInterval(sketch.flushTimer);
  sketch.flushTimer = setInterval(flushPen, 160);
  scheduleCanvasDraw();
});

canvas.addEventListener("pointermove", (e) => {
  const pen = sketch.pen;
  if (!pen) return;
  const pt = toBoardPoint(e);
  const last = pen.points[pen.points.length - 1];
  if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 2.2) return;
  pen.points.push(pt);
  scheduleCanvasDraw();
});

function finishPen() {
  if (!sketch.pen) return;
  clearInterval(sketch.flushTimer);
  flushPen();
  sketch.pen = null;
  scheduleCanvasDraw();
}
canvas.addEventListener("pointerup", finishPen);
canvas.addEventListener("pointercancel", finishPen);

async function disconnectBridge(msg = "") {
  sketch.bridge = null;
  clearInterval(sketch.pollTimer);
  await chrome.storage.local.remove("sketchBridge").catch(() => undefined);
  updatePairingUi();
  if (msg) showError(msg);
}

function startPolling() {
  clearInterval(sketch.pollTimer);
  if (!sketch.bridge || sketch.activeTab !== "draw") return;
  void apiGet(0, null).catch(() => showError(words.syncFailed));
  sketch.pollTimer = setInterval(() => {
    if (sketch.activeTab === "draw" && sketch.bridge && !sketch.pen) {
      void apiGet(sketch.latestSeq, sketch.revision).catch(() => undefined);
    }
  }, 1200);
}

function buildPalette() {
  const swRoot = $("ext-swatches");
  for (const c of sketchColors) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(c === sketch.color));
    b.setAttribute("aria-label", c);
    b.style.background = c;
    b.addEventListener("click", () => {
      sketch.color = c;
      selectTool("pen");
      for (const el of swRoot.querySelectorAll(".swatch")) {
        el.setAttribute("aria-checked", String(el === b));
      }
    });
    swRoot.append(b);
  }

  const stRoot = $("ext-stamps");
  for (const s of sketchStamps) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "stamp-btn";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(s === sketch.stamp));
    b.textContent = s;
    b.addEventListener("click", () => {
      sketch.stamp = s;
      for (const el of stRoot.querySelectorAll(".stamp-btn")) {
        el.setAttribute("aria-checked", String(el === b));
      }
    });
    stRoot.append(b);
  }

  const bgRoot = $("ext-bgs");
  for (const bg of sketchBgs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bg-dot";
    b.dataset.bg = bg;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(bg === sketch.bg));
    b.setAttribute("aria-label", bg);
    b.style.backgroundColor = sketchBgHex[bg];
    b.addEventListener("click", () => {
      updateBgUi(bg);
      if (sketch.bridge) {
        enqueueSketch(async () => {
          try {
            const next = await apiPost({ action: "bg", bg });
            if (next) applyRemoteState(next);
          } catch {
            showError(words.syncFailed);
          }
        });
      }
    });
    bgRoot.append(b);
  }
}

function selectTool(tool) {
  sketch.tool = tool;
  for (const btn of document.querySelectorAll(".tool-btn")) {
    btn.setAttribute("aria-checked", String(btn.dataset.tool === tool));
  }
  $("ext-swatches").hidden = tool === "stamp";
  $("size-group").hidden = tool === "stamp";
  $("ext-stamps").hidden = tool !== "stamp";
}

function setMode(tab) {
  sketch.activeTab = tab;
  const isDraw = tab === "draw";
  $("tab-days").setAttribute("aria-selected", String(!isDraw));
  $("tab-draw").setAttribute("aria-selected", String(isDraw));
  $("panel-days").hidden = isDraw;
  $("panel-draw").hidden = !isDraw;
  clearError();
  if (isDraw) {
    scheduleCanvasDraw();
    startPolling();
  } else {
    clearInterval(sketch.pollTimer);
  }
}

async function init() {
  for (const item of zones) zone.add(new Option(words.zones[item.value] ?? item.label, item.value));
  zone.value = defaultZone;
  try {
    const { calendarPreview } = await chrome.storage.local.get("calendarPreview");
    const saved = typeof calendarPreview === "string" && readSelection(calendarPreview);
    if (saved) {
      start.value = saved.start;
      zone.value = saved.zone;
      remember.checked = true;
    }
  } catch {
    showError(words.loadFailed);
  }

  try {
    const res = await chrome.storage.local.get("sketchBridge");
    const parsed = parseBridge(res?.sketchBridge);
    if (parsed && isSketchToken(parsed.token)) {
      sketch.bridge = {
        token: parsed.token,
        origin: typeof parsed.origin === "string" ? parsed.origin : webOrigin,
        partnerName: typeof parsed.partnerName === "string" ? parsed.partnerName : "",
      };
    }
  } catch {
    // Fallback to offline doodle
  }

  buildPalette();
  updateBgUi(sketch.bg);
  updatePairingUi();

  $("tab-days").addEventListener("click", () => setMode("days"));
  $("tab-draw").addEventListener("click", () => setMode("draw"));

  for (const btn of document.querySelectorAll(".tool-btn")) {
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  }
  for (const btn of document.querySelectorAll(".size-btn")) {
    btn.addEventListener("click", () => {
      sketch.size = Number(btn.dataset.size);
      for (const el of document.querySelectorAll(".size-btn")) {
        el.setAttribute("aria-checked", String(el === btn));
      }
    });
  }

  $("ext-undo").addEventListener("click", () => {
    clearError();
    if (sketch.bridge) {
      sketch.pending = [];
      enqueueSketch(async () => {
        try {
          const next = await apiPost({ action: "undo" });
          if (next) applyRemoteState(next);
        } catch {
          showError(words.syncFailed);
        }
      });
    } else if (sketch.strokes.length > 0) {
      const lastStrokeId = sketch.strokes[sketch.strokes.length - 1].stroke;
      sketch.strokes = sketch.strokes.filter((s) => s.stroke !== lastStrokeId);
      scheduleCanvasDraw();
    }
  });

  $("ext-clear").addEventListener("click", () => {
    clearError();
    if (sketch.bridge) {
      sketch.pending = [];
      enqueueSketch(async () => {
        try {
          const next = await apiPost({ action: "clear" });
          if (next) applyRemoteState(next);
        } catch {
          showError(words.syncFailed);
        }
      });
    } else {
      sketch.strokes = [];
      scheduleCanvasDraw();
    }
  });

  $("pair-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = $("pair-input").value.trim().toLowerCase();
    if (!isSketchToken(raw)) {
      showError(words.badCode);
      return;
    }
    clearError();
    const bridge = { token: raw, origin: webOrigin, partnerName: "" };
    await chrome.storage.local.set({ sketchBridge: JSON.stringify(bridge) });
    sketch.bridge = bridge;
    $("pair-input").value = "";
    $("manual-pair").open = false;
    updatePairingUi();
    startPolling();
  });

  $("disconnect-room").addEventListener("click", () => void disconnectBridge());
  $("connect-room").addEventListener("click", () => void openUrl("/room/draw"));
  $("open-studio").addEventListener("click", () => void openUrl("/room/draw"));

  start.addEventListener("input", render);
  for (const field of [start, zone, remember]) {
    field.addEventListener("change", () => { render(); saveChoice(); });
  }
  $("full").addEventListener("click", () => void openUrl(previewPath("/", start.value, zone.value)));
  document.querySelector("#controls").disabled = false;
  render();
  setInterval(render, 30_000);
}

init();

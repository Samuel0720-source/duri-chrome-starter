import { coupleCalendar, roomToday } from "./core/dates.js";
import { defaultZone, isPreviewStart, previewPath, readSelection, zones } from "./core/preview.js";
import { webOrigin } from "./origin.js";

const start = document.querySelector("#start");
const zone = document.querySelector("#zone");
const remember = document.querySelector("#remember");
const count = document.querySelector("#count");
const nextDay = document.querySelector("#next-day");
const error = document.querySelector("#error");

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function render() {
  nextDay.textContent = "";
  if (!isPreviewStart(start.value)) {
    count.textContent = "첫날을 골라 주세요";
    return;
  }
  const result = coupleCalendar(start.value, roomToday(new Date(), zone.value));
  if (result.status === "upcoming") {
    count.textContent = "첫날까지 D−" + result.daysToStart;
    return;
  }
  count.textContent = result.milestoneToday ? "오늘은 우리 " + result.day + "일" : "함께한 지 " + result.day + "일째";
  nextDay.textContent = result.nextHundred + "일까지 " + result.daysUntilHundred + "일";
}

let writes = Promise.resolve();
function saveChoice() {
  const fields = new URLSearchParams({ start: start.value, zone: zone.value }).toString();
  const keep = remember.checked && readSelection(fields) !== null;
  writes = writes.then(() => keep
    ? chrome.storage.local.set({ calendarPreview: fields })
    : chrome.storage.local.remove("calendarPreview")
  ).catch(() => showError("이 기기에 설정을 저장하지 못했어요."));
}

async function openApp(compact) {
  const path = previewPath(compact ? "/compact" : "/", start.value, zone.value);
  const url = new URL(path, webOrigin).href;
  try {
    await writes;
    if (compact) {
      await chrome.windows.create({ url, type: "popup", width: 420, height: 680 });
    } else {
      await chrome.tabs.create({ url });
    }
    window.close();
  } catch {
    showError("창을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }
}

async function init() {
  for (const item of zones) zone.add(new Option(item.label, item.value));
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
    showError("저장한 날짜를 불러오지 못했어요. 직접 입력해 주세요.");
  }
  start.addEventListener("input", render);
  for (const field of [start, zone, remember]) {
    field.addEventListener("change", () => { render(); saveChoice(); });
  }
  document.querySelector("#mini").addEventListener("click", () => openApp(true));
  document.querySelector("#full").addEventListener("click", () => openApp(false));
  document.querySelector("#controls").disabled = false;
  render();
  setInterval(render, 30_000);
}

init();

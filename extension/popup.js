import { coupleCalendar, roomToday } from "./core/dates.js";
import { defaultZone, isPreviewStart, previewPath, readSelection, zones } from "./core/preview.js";
import { webOrigin } from "./origin.js";

const start = document.querySelector("#start");
const zone = document.querySelector("#zone");
const remember = document.querySelector("#remember");
const $ = (id) => document.querySelector("#" + id);
const count = $("count");
const error = document.querySelector("#error");

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function render() {
  const today = roomToday(new Date(), zone.value);
  $("today").textContent = today.replaceAll("-", ". ");
  $("big").hidden = true;
  $("rows").hidden = true;
  if (!isPreviewStart(start.value)) {
    $("caption").textContent = "첫날을 골라 주세요";
    $("settings").open = true;
    return;
  }
  const result = coupleCalendar(start.value, today);
  $("big").hidden = false;
  if (result.status === "upcoming") {
    $("caption").textContent = "첫날까지";
    count.textContent = "D−" + result.daysToStart;
    $("unit").textContent = "";
    return;
  }
  $("caption").textContent = result.milestoneToday ? "오늘은 우리의 기념일" : "함께한 지";
  count.textContent = result.day.toLocaleString("ko-KR");
  $("unit").textContent = "일째";
  $("rows").hidden = false;
  $("hundred-label").textContent = "우리의 " + result.nextHundred + "일";
  $("hundred-left").textContent = "D−" + result.daysUntilHundred;
  $("hundred-date").textContent = result.hundredDate;
  $("annual-left").textContent = result.daysUntilAnnual === 0 ? "오늘" : "D−" + result.daysUntilAnnual;
  $("annual-date").textContent = result.annual;
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

async function openApp() {
  const url = new URL(previewPath("/", start.value, zone.value), webOrigin).href;
  try {
    await writes;
    await chrome.tabs.create({ url });
    window.close();
  } catch {
    showError("웹앱을 열지 못했어요. 잠시 뒤 다시 시도해 주세요.");
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
  $("full").addEventListener("click", openApp);
  document.querySelector("#controls").disabled = false;
  render();
  setInterval(render, 30_000);
}

init();

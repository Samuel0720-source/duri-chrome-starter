import { coupleCalendar, roomToday } from "./core/dates.js";
import { defaultZone, isPreviewStart, previewPath, readSelection, zones } from "./core/preview.js";
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
  },
  en: {
    title: "Duri · Anniversaries", brand: "Duri", full: "Full web app ↗", result: "Anniversary count", today: "Today", annual: "Anniversary",
    settings: "Date settings", start: "Our first day", zone: "Time zone", remember: "Remember the date and time zone on this device",
    pick: "Pick your first day", untilStart: "Until our first day", milestone: "Today is our anniversary", together: "Together for", days: "days",
    hundred: (n) => "Our day " + n, todayShort: "Today",
    saveFailed: "Could not save the settings on this device.", openFailed: "Could not open the web app. Please try again shortly.",
    loadFailed: "Could not load the saved date. Please enter it again.",
    zones: { "America/Vancouver": "Vancouver", "America/Toronto": "Toronto", "Asia/Seoul": "Seoul" },
  },
}[lang];
document.documentElement.lang = lang;
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = words[el.dataset.i18n];
for (const el of document.querySelectorAll("[data-i18n-label]")) el.setAttribute("aria-label", words[el.dataset.i18nLabel]);
const num = (n) => n.toLocaleString(lang === "ko" ? "ko-KR" : "en-CA");

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

async function openApp() {
  const url = new URL(previewPath("/", start.value, zone.value), webOrigin).href;
  try {
    await writes;
    await chrome.tabs.create({ url });
    window.close();
  } catch {
    showError(words.openFailed);
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

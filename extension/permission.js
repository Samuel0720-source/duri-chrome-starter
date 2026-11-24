// One-time permission page. Chrome cannot show its microphone/camera prompt inside a toolbar popup,
// so the popup opens this tab. Once the extension is allowed here, calls in the popup can use the devices.
// Nothing is recorded: the tracks are stopped as soon as permission is granted.
const ko = navigator.language.startsWith("ko");
const text = ko
  ? { title: "마이크·카메라 허용하기", ask: "아래 버튼을 누르고 Chrome 창에서 ‘허용’을 선택해 주세요.", allow: "허용하기", done: "허용됐어요. 이 탭을 닫고 둘이 아이콘을 다시 눌러 통화하세요.", fail: "허용되지 않았어요. 주소창 왼쪽의 사이트 설정에서 마이크·카메라를 ‘허용’으로 바꿔 주세요." }
  : { title: "Allow microphone & camera", ask: "Press the button and choose “Allow” in Chrome’s prompt.", allow: "Allow", done: "Allowed. Close this tab and click the Duri icon again to call.", fail: "Permission was not granted. Use the site settings next to the address bar to allow the microphone and camera." };
document.documentElement.lang = ko ? "ko" : "en";
document.querySelector("#title").textContent = text.title;
const message = document.querySelector("#message");
const button = document.querySelector("#allow");
message.textContent = text.ask;
button.textContent = text.allow;

async function request() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch {
    // No camera on this computer: voice calls still need the microphone.
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* reported below */ }
  }
  stream?.getTracks().forEach((track) => track.stop());
  message.textContent = stream ? text.done : text.fail;
  button.hidden = Boolean(stream);
}
button.addEventListener("click", request);

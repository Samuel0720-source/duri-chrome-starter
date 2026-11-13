// Pure helpers for sign-in and invites. They hold no secrets and run in tests without Supabase.

// After sign-in we only return to a path on this site, so a crafted link cannot send people elsewhere.
export function safeNext(value: string | null | undefined, fallback = "/room"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// issue_couple_invite returns two UUIDs without dashes: 64 lowercase hex characters.
export function isInviteToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function invitePath(token: string): string {
  return "/invite/" + token;
}

// Database errors are turned into short Korean messages. Raw details never reach the page.
export function roomErrorMessage(message: string | undefined): string {
  const text = message ?? "";
  if (text.includes("Room full")) return "이 방에는 이미 두 사람이 있어요.";
  if (text.includes("Invite unavailable")) return "만료되었거나 이미 사용된 초대예요. 새 초대 링크를 받아 주세요.";
  if (text.includes("Room unavailable")) return "닫혔거나 들어갈 수 없는 방이에요.";
  if (text.includes("Sign in required")) return "먼저 로그인해 주세요.";
  if (text.includes("duplicate key") || text.includes("couple_members_pkey")) return "이미 다른 방에 들어가 있어요.";
  if (text.includes("Invalid account, date or timezone")) return "날짜와 시간대를 다시 확인해 주세요.";
  if (text.includes("Invalid plan")) return "약속 이름은 1~60자로 적어 주세요.";
  if (text.includes("Too many plans")) return "약속은 한 방에 200개까지 저장할 수 있어요.";
  if (text.includes("Plan unavailable")) return "이미 지워졌거나 찾을 수 없는 약속이에요.";
  if (text.includes("Invalid mood")) return "고를 수 없는 무드예요.";
  if (text.includes("Invalid message")) return "메시지는 1~1000자로 적어 주세요.";
  if (text.includes("Slow down")) return "너무 빨리 보내고 있어요. 잠시 뒤에 다시 보내 주세요.";
  if (text.includes("Message unavailable")) return "이미 지워졌거나 지울 수 없는 메시지예요.";
  if (text.includes("Partner needed")) return "상대가 방에 들어와야 게임을 시작할 수 있어요.";
  if (text.includes("Already answered")) return "이미 답한 질문이에요. 답은 바꿀 수 없어요.";
  if (text.includes("Game unavailable")) return "끝났거나 찾을 수 없는 게임이에요.";
  if (text.includes("Invalid answer")) return "보기에서 하나씩 골라 주세요.";
  if (text.includes("Invalid category")) return "고를 수 없는 카테고리예요.";
  if (text.includes("Invalid guess")) return "정답은 1~30자로 적어 주세요.";
  if (text.includes("Too many guesses")) return "이번 판에서 시도할 수 있는 횟수를 모두 썼어요.";
  if (text.includes("Too many strokes")) return "한 판에 그릴 수 있는 선을 모두 썼어요. 전체 지우기를 눌러 보세요.";
  if (text.includes("Invalid stroke")) return "이 선은 보낼 수 없어요. 다시 그려 주세요.";
  if (text.includes("Invalid video link")) return "유튜브 링크가 아닌 것 같아요. 예: https://youtu.be/영상번호";
  if (text.includes("No video")) return "먼저 영상 링크를 넣어 주세요.";
  if (text.includes("Too many commands")) return "너무 빨라요. 잠깐 뒤에 다시 눌러 주세요.";
  if (text.includes("Invalid command") || text.includes("Invalid position")) return "이 조작은 보낼 수 없어요.";
  return "잠시 문제가 생겼어요. 다시 시도해 주세요.";
}

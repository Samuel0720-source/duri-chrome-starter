// Pure helpers for sign-in and invites. They hold no secrets and run in tests without Supabase.

// After sign-in we only return to a path on this site, so a crafted link cannot send people elsewhere.
export function safeNext(value: string | null | undefined, fallback = "/room"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Passwords: at least 8 characters. Supabase stores them with bcrypt, which reads only the first 72 bytes,
// so a longer one would silently ignore its end; we refuse it instead.
export const PASSWORD_MIN = 8;
export function passwordProblem(value: string): "short" | "long" | null {
  if (value.length < PASSWORD_MIN) return "short";
  if (new TextEncoder().encode(value).length > 72) return "long";
  return null;
}

// Supabase Auth error messages become a dictionary key for the sign-in screens.
export function authErrorKey(message: string | undefined) {
  const text = (message ?? "").toLowerCase();
  if (text.includes("invalid login credentials")) return "login.err.wrong" as const;
  if (text.includes("email not confirmed")) return "login.err.unconfirmed" as const;
  if (text.includes("rate limit") || text.includes("too many")) return "login.err.rate" as const;
  if (text.includes("password")) return "login.err.weak" as const;
  return "login.err.try" as const;
}

// issue_couple_invite returns two UUIDs without dashes: 64 lowercase hex characters.
export function isInviteToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

export function invitePath(token: string): string {
  return "/invite/" + token;
}

// Database errors become a dictionary key (src/i18n/messages); the screen shows it in the chosen language.
// Raw database details never reach the page.
export function roomErrorKey(message: string | undefined) {
  const text = message ?? "";
  if (text.includes("Room full")) return "err.full";
  if (text.includes("Invite unavailable")) return "err.inviteGone";
  if (text.includes("Room unavailable")) return "err.room";
  if (text.includes("Sign in required")) return "err.signIn";
  if (text.includes("duplicate key") || text.includes("couple_members_pkey")) return "err.member";
  if (text.includes("Invalid account, date or timezone")) return "err.dateZone";
  if (text.includes("Invalid plan")) return "err.plan";
  if (text.includes("Too many plans")) return "err.tooManyPlans";
  if (text.includes("Plan unavailable")) return "err.planGone";
  if (text.includes("Invalid mood")) return "err.mood";
  if (text.includes("Invalid message")) return "err.message";
  if (text.includes("Slow down")) return "err.slowDown";
  if (text.includes("Message unavailable")) return "err.messageGone";
  if (text.includes("Partner needed")) return "err.partner";
  if (text.includes("Already answered")) return "err.answered";
  if (text.includes("Game unavailable")) return "err.game";
  if (text.includes("Invalid answer")) return "err.answer";
  if (text.includes("Invalid category")) return "err.category";
  if (text.includes("Invalid guess")) return "err.guessLen";
  if (text.includes("Too many guesses")) return "err.tooManyGuesses";
  if (text.includes("Too many strokes")) return "err.tooManyStrokes";
  if (text.includes("Invalid stroke")) return "err.stroke";
  if (text.includes("Invalid video link")) return "err.videoLink";
  if (text.includes("No video")) return "err.noVideo";
  if (text.includes("Too many commands")) return "err.tooFast";
  if (text.includes("Invalid command") || text.includes("Invalid position")) return "err.command";
  if (text.includes("Not your turn")) return "err.notYourTurn";
  if (text.includes("Occupied")) return "err.occupied";
  if (text.includes("Game over")) return "err.gameOver";
  if (text.includes("Invalid shot")) return "err.shot";
  if (text.includes("Ball moving")) return "err.ballMoving";
  if (text.includes("Already in the cup")) return "err.inCup";
  if (text.includes("Invalid course")) return "err.course";
  if (text.includes("Invalid move")) return "err.move";
  if (text.includes("Invalid nickname")) return "err.nickname";
  if (text.includes("Bridge token unavailable")) return "err.bridgeToken";
  return "err.unknown";
}

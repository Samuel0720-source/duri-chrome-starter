// Never persist auth tokens, invite codes, or an arbitrary URL supplied by a page.
export function surfacePath(input) {
  try {
    const u = new URL(input, "https://duri.invalid");
    if (u.origin !== "https://duri.invalid") return "/room";
    if (!/^\/room(?:\/(?:game|draw|watch|album|chat|settings))?\/?$/.test(u.pathname) && !["/login", "/signup", "/login/forgot", "/login/reset"].includes(u.pathname)) return "/room";
    const game = u.searchParams.get("g");
    return u.pathname + (game && /^[a-z-]{1,24}$/.test(game) ? "?g=" + game : "");
  } catch { return "/room"; }
}

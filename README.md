# Duri (둘이) · a private room for two

Duri is a Korean/English web app for couples. Two people share one private room: an anniversary counter, chat with voice and video calls, a shared album, small games, and watching YouTube or Netflix together. It runs as a regular website, as an installable app (PWA), and as a Chrome toolbar extension that shows your day count at a glance. All three use the same code and the same room.

**Live:** https://duri-chrome-starter.vercel.app

## What's inside

| Area | What you can do | Main code |
|---|---|---|
| Home | Days together, next 100-day milestone, yearly anniversaries, both birthdays, shared plans, room mood (5 themes) and a photo background | `src/app/room/page.tsx`, `src/app/milestone-rail.tsx`, `src/core/dates.ts` |
| Chat | Messages with read receipts, daily question postcard, 1:1 voice/video call (WebRTC, Cloudflare TURN relay) that stays connected while you browse the room | `src/app/room/chat/`, `src/core/chat.ts`, `src/core/ice.ts` |
| Games | Guess my answer, 100-second drawing quiz, simultaneous mini golf, gomoku, heads-up Texas Hold'em, postcard memory match. Rematches need both people to agree | `src/app/room/game/`, `src/core/{guess,draw,golf,gomoku,poker,postcards}.ts` |
| Watch together | Shared YouTube player with synced play/pause/seek, or Netflix through the extension (each person plays in their own Netflix tab) | `src/app/room/watch/`, `src/core/{playback,watch}.ts`, `extension/netflix-*.js` |
| Album | Private shared photos (JPEG/WebP, max 200 per room). Any photo can become the room background | `src/app/room/album/`, `src/app/api/photo/[id]/` |
| Account | Email + password or Google sign-in, one-time invite link, leave the room, delete your account and data | `src/app/login/`, `src/app/invite/`, `src/app/room/actions.ts` |
| Chrome extension | Toolbar panel with today's day count and next milestone, a button that opens the full web app | `extension/`, `scripts/build-extension.mjs` |

Both languages live in `src/i18n/messages/{en,ko}.ts`.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript**, deployed on **Vercel**.
- **Supabase**: Auth, Postgres, Realtime (private room channels), Storage (private album bucket).
- Game and room rules run in Postgres functions (`security definer`), protected by row-level security. Clients never read game tables directly, so a hidden answer, a drawing word, or the other player's cards never reach the browser early. A revision number plus a request ID on every action makes retries and double taps safe.
- The pure logic in `src/core/` is shared by the web app and copied into the extension at build time.

## Run it locally

Requires **Node.js 24**.

```bash
npm ci
cp .env.example .env.local   # fill in your Supabase project values
npm run dev                  # http://localhost:3000
```

The public anniversary preview at `/` works without any keys. Rooms, chat, and games need a Supabase project with the migrations in `supabase/migrations/` applied, in file name order.

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Invite links and auth redirects |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server Supabase clients |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` | Optional, server only. TURN relay so calls work across different networks |
| `SUPABASE_SECRET_KEY` | Only for `npm run test:flow`. Never put it in a `NEXT_PUBLIC_` variable |

## Load the Chrome extension

1. Run `npm run extension:build` (or `npm run extension:build -- https://your-deployment` to point it at a deployed site).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/chrome-extension`.
3. Pin **Duri** from the puzzle menu. Your start date and time zone are stored on this device only if you turn on "Remember on this device."

`npm run extension:release` builds the Chrome Web Store ZIP and checks the manifest. The only permission is `storage`, and content scripts run only on `netflix.com/watch/*` and the app's watch page. See `docs/RELEASE.md`.

## Install as an app (PWA)

Open the site in Chrome and choose **Install app** (or **⋮ → Cast, save and share → Install page as app**). The installed window uses the same web app. The service worker caches only the public offline page.

## Tests

```bash
npx playwright install chromium   # once, before the first browser test run
npm run typecheck
npm test                          # unit → database → build → browser
```

| Command | Covers |
|---|---|
| `npm run test:unit` | Dates, milestones, game rules, playback drift, i18n parity, extension surface |
| `npm run test:db` | Runs every migration on a throwaway embedded Postgres. Covers invite races, outsider access refused, hidden answers, game turn rules and duplicates, album limits, and account deletion |
| `npm run test:e2e` | Production build in Playwright: layouts at 320/390/768/1440px, PWA install, the real extension, two-tab calls |
| `npm run test:flow` | Two real users against the deployed site (needs `SUPABASE_SECRET_KEY`) |

CI: `.github/workflows/check.yml` runs the full suite on every push. `live-flow.yml` waits for Vercel to deploy each push to `main`, then runs the two-user flow against the live site.

## Project docs

| Question | File |
|---|---|
| Where do I start, which commands? | `CLAUDE.md` |
| What is done, what was verified, what's next? | `docs/STATUS.md` |
| Phases and pass criteria | `docs/PHASES.md`, `docs/PRODUCT.md` |
| Data flow and design decisions | `docs/ARCHITECTURE.md`, `docs/POLICIES.md` |
| Releasing the extension and moving to a custom domain | `docs/RELEASE.md` |

The project docs are written in Korean. `.claude/agents/` holds three Claude Code helper agents: `phase-planner`, `data-reviewer`, and `qa-runner`.

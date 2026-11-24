# Product rules and checks per phase

## Calendar and video

- The start date is day 1. A future start date can be saved; until then the screen shows "D−n until day one". Today's calendar date comes from the room's IANA time zone. Time differences between devices and DST changes are never used to divide elapsed days by hours.
- If the start date is February 29, the yearly anniversary in a common year is February 28. On a multiple of 100 days, the screen shows today's mark together with the **next** hundred. Example: start 2026-08-13, 100 days 2026-11-20, 200 days 2027-02-28.
- Video state is stored as videoId, position, server reference time, playing flag and an increasing revision. While playing, the target position is the reference position plus server elapsed time; while paused, it is the reference position. Stale revisions and your own events are ignored.
- The periodic check runs only when both sides are ready and neither is buffering or showing an ad. It re-syncs only when the gap is **more than 1.0 s** and at least 3 s have passed since the last automatic correction; exactly 1 s is left alone. Play, pause and seek pressed by a person, and reconnects, apply immediately regardless of this cooldown.
- Watch together accepts only YouTube, Vimeo and https video files (.mp4 .webm .ogg .ogv .mov .m4v). While playing, that site can see both people's IP addresses (stated in the privacy policy). DRM services such as Netflix are not embedded (see the Netflix section).

## Album and room background

- Photos live only in a private bucket; only the two people in the room can upload, view and delete them (Storage policies). The list (`room_photos`) changes only through functions. Only the uploader can remove a photo from the album. The room background is one album photo, the same for both people. 200 photos per room, 5 MB per file, JPEG/WebP only (the browser re-encodes to JPEG and strips camera data). Leaving the room or deleting the account deletes the files first, and stops if file deletion fails. Photos already downloaded may stay in that browser's cache (up to 7 days, private).

## Sign-in

- Google, or email and password (at least 8 characters; first sign-in after confirming the email). Password reset: mail link → set a new password in the same browser. No Apple sign-in until there is a (paid) Apple developer account.

## Netflix watch together

- No account sharing and no screen relaying (DRM and Netflix's terms). Each person watches on their own Netflix; the extension passes only play state, seconds and the title number to the Watch together page on the same computer. Desktop Chrome only.

## Nicknames and read receipts

- Nicknames are 1 to 20 characters with no control characters; clearing one removes it. The nickname I choose is used only on my screen (my partner can see it, but their screen uses the name they chose). Read receipts store only "the last message number read and when", updated only while the screen is visible and focused. They are deleted with the room when it closes.

## Data lifetime and permissions

| Action | Result |
|---|---|
| Close the tab or sign out | Account, room and history stay on the server and come back on the next sign-in. |
| Leave the room | After confirming "The room closes and neither of you can access the shared history", the room ends. Both seats and any invite are revoked at once, and the partner's personal inbox gets "Your partner left the room". The room is never refilled with a new partner. Deleting your own data is a separate personal menu. |
| Delete my data | In both active and closed rooms, you can choose to delete messages and saved preferences you wrote from the account menu. Linked summaries, quotes, memories and stored attachments are removed or recomputed. You get no delete rights over material that belongs only to someone else. Shared data in closed rooms is cleaned up after a period announced in advance (proposed default 30 days), with the retention notice and cleanup job built together. |
| Delete account | After recent authentication and explicit confirmation: close your rooms → clean up your personal data, objects and derived data → delete the Auth account on the server. On failure, a deletion job id is recorded for retry. The other member's account stays. How long backups keep data is checked against the hosting policy and disclosed. |

Tests cover not just table RLS but also Storage paths, the `realtime.messages` policy for private Realtime channels, and direct RPC and REST calls. Each room's channel uses a unique generation id, and no new events are published on it after the room closes. Realtime permissions can be cached for the life of a connection, so tests check that an existing connection does not receive new messages either. Tokens, raw chat, exact coordinates and private game answers never go into logs or public analytics events. [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) · [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Cost and external services (P5)

- Defaults: `PAID_API_ENABLED=false`, external API budget CAD 0 per month. Proposed pilot limits: **CAD 15 per UTC month for the whole project**, **10 AI calls and 3 place-API calls per room per UTC day**. Domain, hosting and developer-tool costs are separate. These numbers are an operator's budget, not the services' actual prices.
- Keys are server-only. So that calls never run unbounded after a free tier ends, every paid request (retries and place-detail lookups included) is counted on one server path. All instances share the same PostgreSQL ledger. Room/day and project/month are locked in one transaction and the worst-case amount is reserved with an idempotency key. Over the limit, a missing price or exchange-rate entry, or billing turned off blocks the call **before** the upstream API is called. Actual usage is settled after the response; if a timeout leaves billing unknown, the reservation is kept, conservatively.
- Per-server limits on tokens, result fields, maximum output and retries. An 80% alert, the in-app block and provider quotas are used together. The estimated cost ceiling is compared with the real bill. A Google Cloud budget alert alone does not stop charges. [Google Cloud budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets) · [Places billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- The 5,000 m radius is straight-line distance from one centre point the user picks, boundary included. Only allowed results are shown, and only fields that may be stored long-term (place id, the user's own plan notes) are saved. AI summaries are limited to the range and source messages both people allowed. Withdrawing consent stops further use and cleans up derived summaries.

## Previews and release

Preview and production use separate databases, auth redirects and keys. Invites and sign-in returns use a verified HTTPS origin. URL tokens are stripped from logs and analytics. HTTPS previews are kept distinct from the .com/.ca production domain, and the real link is recorded in STATUS only after DNS, certificates and sign-in on two devices are verified.

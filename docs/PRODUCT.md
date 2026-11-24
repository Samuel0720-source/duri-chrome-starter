# Duri · product spec by phase

Duri is for two people on different devices who want to spend 5 to 15 minutes together. It runs at the same address in Chrome on phone, tablet and desktop, and can be installed as a PWA. This document breaks the couple-room spec into small units of work. PHASES is the source of truth for build order and exit criteria; POLICIES is the source of truth for behaviour rules.

## Access and home (P1–P3)

- In desktop Chrome, the toolbar lets you pick a first day and time zone to compute anniversaries, then open a small standalone window or the full web app with a button. A date changed in the small window must carry over to the full web app. Installing the extension, installing the web app as a PWA, and visiting the URL each work on their own. The P1 anniversary calculator is a public preview; syncing the real room's date comes in P2–P3.
- The main actions on the public home page are sign in and accept an invite. One account per person, two people per room. Email confirmation links are the default, and after sign-in you return to the original invite. Designed flows: issuing and copying the first link, waiting, the second person joining, expired / already used / room full, and returning visits.
- Home shows days together, the next hundred-day mark, yearly anniversaries and a D-day to the next meeting. The start date, plans and shared time zone can be edited and saved. Home's main button adapts: "Invite your partner", "Continue", or "Pick a game to play together".
- The main menu is Home / Games / Watch together / Chat. In Settings, "Room mood" previews and applies Berry Cream, Forest Walk, Rainy Café, Sunset Picnic and Midnight Cinema, and the partner sees it on their next load. Checked at 320/390 px phones, 768 px tablet, 1440 px desktop, window resizing and the standalone window. Keyboard focus and whose-turn indicators must stay clear in every mood.
- Plans, chat, shared mood, games in progress and scores are stored on the server. A reload, closing the tab, or signing out and back in on another device restores the last confirmed state. Leaving the room and explicit deletion are separate actions described in POLICIES.

## Four games for two (P3, P4, P6)

1. **Guess your partner's pick.** Three rounds. Each person submits their own answer and their guess of the partner's. Until both have submitted, the real choice is hidden from the partner's API responses and channel. Submitting at different times or after signing in again continues the game.
2. **100-second drawing quiz.** Pick a category (food, animals, objects, places, date activities); once both are ready, the server sets the deadline. One person draws the word with pen, stroke width and undo; the other types guesses. The word goes only to the drawer and guesses are compared on the server against normalized accepted spellings. Wrong guesses can retry; a correct guess or the timeout is settled exactly once. Shows the couple's fastest correct time per category and this round's time. Roles swap next round, and the drawing and remaining time are restored after a reload.
3. **Simultaneous mini golf.** Both people hit distinct balls on the same course by dragging, without waiting for turns. The server computes each shot and both devices replay the path. Balls pass through each other and collide with walls and obstacles. When both are in, the next hole starts. Best totals for 1-hole and 3-hole courses are kept separately. Tested: resent shots, simultaneous finishes, restoring ball positions and strokes on a new device.
4. **One-on-one gomoku (P6).** 15×15 freestyle. On your turn, place a stone on an empty cell; five or more in a row horizontally, vertically or diagonally wins, and a full board is a draw. Placement preview on mobile, last move and winning line highlighted, first move alternates on rematch, running record and board restore.

## YouTube watch together (P4)

One person pastes a video link → both mark ready → playback starts together in the official player. The server confirms play, pause and seek state with a revision. A returning user jumps to the current moment, and when both leave the last shared position is saved. Invalid links, embed restrictions, blocked autoplay and buffering each show the next step that device can take. The 1-second correction rule follows POLICIES. [YouTube IFrame Player](https://developers.google.com/youtube/iframe_api_reference)

## Shared AI helper (P5) · hidden from the app on 2026-11-14 at Sam's request (to return later; the earlier code is in git history)

- Shows the two speakers and the AI, separating "our chat" from "ask the AI". Keeps follow-up conditions such as "10 minutes, nothing competitive" or "something we don't have to talk during" and recommends activities the app can actually offer now. If both press the same recommendation, one game opens.
- Days until an anniversary come from the app's calendar functions. Offers two plans that fit the time and budget, "save to anniversary", and later edits or deletion.
- Confirms a reference location and recommends only real places within 5,000 m, for example an indoor date centred on Richmond–Brighouse Station with a CAD 40 budget. Shows the place name, distance, reason, open-in-maps and save, and shows hours or prices only where confirmed. If the location is ambiguous, the API is unavailable or there are no results, it says so plainly.
- Summarizes interests from the chat period or messages both people allowed, separating what both said from what only one said and linking to the source messages. Only shared preferences reviewed and saved are used for later recommendations, with edit, delete, consent withdrawal and refreshed summaries supported.
- Counts, per couple and recommendation id, how often a recommendation leads to a game actually starting or a plan being saved. Failures, retries and budget limits are shown in the UI, and the basic games and calendar keep working without AI.

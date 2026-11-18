# Heads-up poker and agreed rematches

Duri offers a two-player no-limit Texas Hold’em match with equal 50, 75 or 100 BB starting stacks. Blinds are fixed at 1/2 chips, with no ante, so the stacks contain 100, 150 or 200 chips each. Stack depth is a choice, not a promised duration. This is a custom play-chip format, not an official WSOP tournament or a cash game.

The button posts the small blind and acts first pre-flop; the big blind acts first on later streets. Betting enforces minimum full raises, short all-ins, calls, checks and folds. Uncalled chips are returned. Seven-card hands are ranked by their best five cards, including ace-low straights, kickers and shared-board ties. Both players ready up between hands; the match ends when one stack is empty.

Rule reference: [WSOP 2026 rules](https://wsop.gg-global-cdn.com/wsop/pdfs/2026-WSOP-Tournament-Rules.pdf), especially rules 73, 87 and 96. Live dealer, registration and tournament-administration rules are not simulated.

## State and privacy

The private PostgreSQL table owns the deck, hole cards, turn and chip counts. Authenticated RPCs verify active room membership; public state includes only the caller's hole cards until showdown. A fold does not reveal the folded hand. Broadcasts contain invalidations, never cards. Mutations lock the room and check a monotonically increasing revision, including across restarts.

Every game has a new-game request. A current partner must accept before an ongoing match is replaced. Requests expire after two minutes and are bound to the current game; poker/postcard actions invalidate their pending request. Replays of accepted requests do not start multiple matches. Existing completed-game start controls remain available. Restart preserves historical wins, question rotation and best records; unfinished rounds are cancelled without awarding a win or tie. Expired draw rounds and finished golf holes are settled before replacement.

Competitive games display Victory, Lost or Draw, with the partner nickname. Drawing remains a cooperative result. All new controls have Korean/English text and use the selected room palette. The extension uses the same web route without a package update; a persistent room call stays mounted when entering poker.

## Verification

Local typecheck, 62 unit tests, 29 database scenarios and production build passed. Database tests cover all nine hand categories, wheel and kickers, hidden-card and outsider access, heads-up ordering, minimum raises, all-in refunds, ties, match end, duplicate actions/acceptances, equal stack selection, stale/expired consent, all five existing game restarts and earned-record preservation.

The authenticated compact browser flow also exercises stack agreement, call/check/fold, opposite result banners, a stack-changing rematch and the same live audio stream during poker. Deployment verification is recorded in the release commit's CI results.

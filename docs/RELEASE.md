# Release checklist · extension distribution and domain

## 1. Build the file for the Chrome Web Store

```bash
npm run extension:release                          # current address: https://duri-chrome-starter.vercel.app
npm run extension:release https://your-domain.ca   # after connecting a domain
```

- Output: `dist/duri-extension-<version>.zip` and its sha256. Only https addresses are allowed (localhost is refused).
- Checked before packaging: Manifest V3, version format, `storage` as the only permission, `host_permissions` limited to Duri's fixed origin, content scripts only on Netflix watch pages and the Duri origin, a single service worker as background, icons 16/32/48/128, `_locales/en` and `_locales/ko`.
- Bump `version` in `extension/manifest.json` for every upload (the store rejects a repeated version).

## 2. Store submission (only Sam can do this)

1. Register in the Chrome Web Store developer dashboard with a Google account (there is a one-time registration fee; check the amount in the dashboard).
2. **New item → upload the zip.**
3. Store listing: name and description from the English and Korean text in `_locales`, at least one 1280×800 screenshot (popup screens), 128 px icon.
4. **Permission justification (storage):** "Stores only the last screen, language and theme on the device, and remembers the id of the open small window for the browser session. Chats, photos and login tokens are never copied into extension storage."
5. **Site access justification (Netflix and Duri):** "Netflix watch together: on netflix.com/watch pages, reads only play state, position and the title number and passes them to the Duri Watch together page on the same computer. Account and viewing history are not read. Access to the Duri site is needed to show the signed-in room in the popup and match its screen, language and theme."
6. **Privacy practices:** Fill in the dashboard based on what the service actually handles: account information, chats, photos and drawings the user writes, game records, and call media. Do not choose "does not collect any data". Distinguish extension code from website code: the extension logic is in the package, and the authenticated web app runs in an iframe on the Duri origin. Privacy policy: `<address>/privacy`. Give reviewers test steps so they can check two connected accounts, chat, games and calls.
7. Publish first as Unlisted (anyone with the link), install it yourself, then switch to Public.

## 3. Connecting a domain (.com or .ca)

| Step | Where | What to do |
|---|---|---|
| 1 | Domain registrar (Sam) | Buy the domain |
| 2 | Vercel → project → Domains | Add the domain, enter the DNS records Vercel shows at the registrar, confirm the certificate is issued |
| 3 | Vercel → Environment Variables | `NEXT_PUBLIC_APP_URL=https://new-domain` (Production), then redeploy |
| 4 | Supabase → Authentication → URL Configuration | Set Site URL to the new domain and add `https://new-domain/auth/callback` to Redirect URLs (keep vercel.app during the switch) |
| 5 | Google Cloud → OAuth client | Add the new domain to Authorized JavaScript origins (the redirect URI stays the Supabase callback) |
| 6 | GitHub → Secrets | Point the flow-test address `FLOW_URL` at the new domain |
| 7 | This repository | `npm run extension:release https://new-domain` → update the store with the new version |
| 8 | Verify | Google sign-in on the new domain → invite links use the new domain → the extension's "Open full app" opens the new domain → flow tests pass |

Sign-in cookies are per domain, so after a domain change everyone signs in once more (and stays signed in after that).

## 0.5.3 final checks before submission
- Install the ZIP in a clean Chrome profile, connect two test accounts, and check English/Korean Chat at 440×600. The composer must remain clickable without scrolling the whole page.
- Check first-open delay after restarting Chrome on the target Mac. The 100ms preference deadline is not an end-to-end loading-time guarantee.
- Test camera/microphone permission denial, re-enabling permissions, and a continuing small-window call on two different networks. CI uses synthetic devices.
- Confirm the public privacy page and store disclosures describe the current authenticated app, including Limited Use. The old date-only extension description is insufficient.
- Provide reviewer test instructions/accounts through the store's private review fields; never commit account credentials.
- Store approval is separate from the automated test suite. Official references: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements and https://developer.chrome.com/docs/webstore/program-policies/user-data-faq . An isolated web iframe is not blanket approval of undisclosed or unreviewable remote functionality.

## 0.5.6 store submission · copy-paste text (English dashboard)

- **Item name:** Duri
- **Summary (from the manifest):** Your shared room for two in the Chrome toolbar: chat, voice and video calls, games, photos and anniversaries.
- **Category:** Social & Communication · **Language:** English
- **Detailed description:**

```
Duri is a private room for exactly two people, one click away in your Chrome toolbar.

Open the popup and you are back in your room: how many days you have been together, the next 100-day mark, anniversaries and both birthdays, and your chat.

What you can do together
- Chat with read receipts, and start a voice or video call from the popup. Move the call into a small window that stays open while you keep browsing.
- Play eight real-time games for two: chess, number baseball, gomoku, mini golf where you both shoot at once, a 100-second drawing quiz, "guess your partner's pick", postcard memory and heads-up poker.
- Draw together on a shared board and save drawings to a private album.
- Watch YouTube, Vimeo or video files in sync. On a computer, you can also keep Netflix in sync while each of you plays it on your own account.
- Keep a shared photo album and pick one photo as the room background.

Private by design
- A room holds two people. An invite link works once and expires.
- Every rule (whose turn it is, hidden answers, who can see a photo) is enforced on the server, not in the browser.
- The extension stores only your last screen, language and theme on this device. It never copies messages, photos or login tokens.

Sign in with Google or email on the Duri website. The same room also works as a website and an installable app on your phone.

Privacy policy: https://duri-chrome-starter.vercel.app/privacy
```

Upload `dist/duri-extension-0.5.6.zip` only after the website commit with popup calls is live (the popup shows the live site).

- **Single purpose:** Opens the user's private two-person Duri room (chat, calls, games, photos, anniversaries) from the Chrome toolbar, and optionally syncs Netflix playback for Duri's Watch together page.
- **storage justification:** Remembers the last opened Duri screen, language and theme on this device, and the id of the optional small window for the browser session. No messages, photos or login tokens are stored.
- **Host permission (Duri site) justification:** The popup embeds the signed-in Duri website in an iframe and needs site access so the room, its cookies and its language/theme work inside the popup.
- **Content scripts (netflix.com/watch) justification:** For Watch together only: reads play/pause state, current time and the title number on Netflix watch pages and relays them to the Duri tab on the same computer. No account, password or history is read.
- **Microphone/camera:** No manifest permission. Calls run in the Duri website frame. Chrome cannot prompt inside a popup, so `permission.html` asks once in a normal tab; it stops the devices immediately and records nothing.
- **Remote code:** No. All extension JavaScript is in the package; the Duri website runs in its own origin inside an iframe without extension APIs.
- **Privacy policy URL:** https://duri-chrome-starter.vercel.app/privacy
- **Data disclosure:** Personally identifiable info (email/name for the account), personal communications (chat, calls), user-generated content (photos, drawings). Not sold, not used for unrelated purposes, not used for creditworthiness. Tick the Limited Use certifications.
- **Screenshots:** at least one 1280×800 (popup Chat tab with the call buttons, popup Home). **Icon:** `extension/icons/128.png`.
- **Reviewer notes:** provide two test accounts already in one room (private review field only) and the steps: pin Duri → open popup → Chat → Voice call; second account accepts on the website.

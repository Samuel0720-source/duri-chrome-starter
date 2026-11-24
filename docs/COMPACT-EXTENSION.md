# Duri compact extension 0.5.5

Build: `npm run extension:release`. The output is `dist/duri-extension-0.5.5.zip` pointing at the production Duri website.

1. Unzip it into a stable folder.
2. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked. Select the folder containing `manifest.json`.
3. If updating an existing unpacked installation, replace that folder's files with this version and click Reload on its extension card. Otherwise disable/remove the old Duri extension so only the new icon is active.
4. Pin Duri. Sign in using the same Chrome profile as the website. The popup contains the current room and all seven tabs.

Toolbar controls: refresh, open/focus a small persistent window, open the full website. Voice and video calls start directly in the popup's Chat tab (0.5.5). A 440×600 toolbar popup closes when you click outside it, which ends a call placed there, so the popup shows "Keep this popup open during the call." For a call that must survive switching apps, Netflix, or a file picker, open the small window (▣) first.

Chrome cannot show its microphone/camera prompt inside a toolbar popup. If a popup call cannot open the devices, the call box offers "Allow microphone & camera", which opens the packaged `permission.html` in a normal tab. Granting there allows the extension origin once. Delegated through the iframe's `allow="camera; microphone"`, the grant then covers calls in the popup. The page stops the tracks immediately and records nothing. The small window is 440×600 including browser framing and can be resized. Google login opens in that small window; complete login there, then reopen/refresh the toolbar. Camera and microphone permissions belong to the Duri website.

The website's own-origin host permission supports the authenticated embedded room. The extension does not read arbitrary browsing pages, store your conversation or copy credentials. Netflix's optional watch integration only runs on its watch pages. Future website feature/design updates appear when the room loads again; changes to packaged Chrome permissions or toolbar code require an extension update. Chrome Web Store publication and approval are separate from an unpacked installation.

## Implementation and permission scope

The popup embeds only the configured Duri origin and reuses the live `/room` components. A packaged isolated-world bridge reports locale, theme and a sanitized path to the toolbar. No conversation, private game answer, auth token or invite code is stored by the wrapper. The sole explicit host permission is the configured Duri origin, needed for embedded cookie/storage access. Netflix scripts still match only its watch pages. Website code runs in its own origin without extension APIs. Only Duri frames get the compact and watch bridges; message handlers validate source, origin, sender and allowed paths.

The persistent window is reused without navigating an active call away. `/compact` opens the current room; old date hashes are preserved at `/compact/calendar`. Native tests cover locale cookies, shared login, server actions, theme updates, chat, album upload/delete, the watch bridge and small-window reuse. Web Store review and manual testing on the user's Mac remain distinct from automated checks.

Authenticated embedding: Chrome's same-site network exemption does not expose SameSite cookies to `document.cookie`. The embedded Duri page therefore obtains its own validated access token from a same-origin, no-store HTTP endpoint and uses it only in page memory. Each authenticated operation rechecks the current website session so switching accounts cannot reuse a cached token. No refresh token is returned and no credential crosses the extension message bridge. Normal tabs retain the existing cookie-based Supabase client. The endpoint rejects cross-site/navigation requests; database row-level security continues to enforce room membership.

## Calls across room tabs

The shared `/room` layout owns call signaling and media. Internal navigation uses Next links, so Games, Album, Watch, Home and Settings retain the same peer connection and audio element. A bottom dock provides mute/end controls, with collapsible video outside Chat. The dock reserves its measured height to keep game controls reachable. Incoming calls can be accepted from any room tab. A dedicated authenticated realtime client prevents page-specific channel cleanup from unsubscribing the call listener. Logging out, leaving the room, closing or reloading the document, or losing signaling ends the session and releases media. A Chrome toolbar popup still closes when it loses focus; use the persistent small window for ongoing sessions. Website layout updates appear on refresh; the startup changes require extension 0.5.4.

The 0.5.4 launcher explicitly requests a normal popup, reapplies 440×600 bounds after creation, and normalizes/resizes a reused window without navigating its document. Resize errors report failure instead of opening a duplicate call window. The toolbar Call in a small window button uses this same launcher. Updating the website alone cannot replace an installed unpacked extension; install/reload the new extension package.

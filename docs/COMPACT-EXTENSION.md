# Duri compact extension 0.5.0

Build: `npm run extension:release`. The output is `dist/duri-extension-0.5.0.zip` pointing at the production Duri website.

1. Unzip it into a stable folder.
2. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked. Select the folder containing `manifest.json`.
3. If updating an existing unpacked installation, replace that folder's files with this version and click Reload on its extension card. Otherwise disable/remove the old Duri extension so only the new icon is active.
4. Pin Duri. Sign in using the same Chrome profile as the website. The popup contains the current room and all six tabs.

Toolbar controls: refresh, open/focus a small persistent window, open the full website. A 440×600 toolbar popup closes when you click outside it. For a continuing call, Netflix, or a file picker that closes the toolbar, open the small window first. The small window is 460×680 including browser framing and can be resized. Google login opens in that small window; complete login there, then reopen/refresh the toolbar. Camera and microphone permissions belong to the Duri website.

The website's own-origin host permission supports the authenticated embedded room. The extension does not read arbitrary browsing pages, store your conversation or copy credentials. Netflix's optional watch integration only runs on its watch pages. Future website feature/design updates appear when the room loads again; changes to packaged Chrome permissions or toolbar code require an extension update. Chrome Web Store publication and approval are separate from an unpacked installation.

## Implementation and permission scope

The popup embeds only the configured Duri origin and reuses the live `/room` components. A packaged isolated-world bridge reports locale, theme and a sanitized path to the toolbar. No conversation, private game answer, auth token or invite code is stored by the wrapper. The sole explicit host permission is the configured Duri origin, needed for embedded cookie/storage access. Netflix scripts still match only its watch pages. Website code runs in its own origin without extension APIs. Only Duri frames get the compact and watch bridges; message handlers validate source, origin, sender and allowed paths.

The persistent window is reused without navigating an active call away. `/compact` opens the current room; old date hashes are preserved at `/compact/calendar`. Native tests cover locale cookies, shared login, server actions, theme updates, chat, album upload/delete, the watch bridge and small-window reuse. Web Store review and manual testing on the user's Mac remain distinct from automated checks.

# Extension 0.5.1: direct small window

Clicking the toolbar icon now opens the existing 460×680 standalone web window
without first building the toolbar popup and its iframe. Repeated clicks focus the
same window without navigating or reloading it, preserving the active game and call.
A closed window is recreated; the window ID survives service-worker suspension.
The website, authentication, games, themes and permissions are unchanged.

This changes the installed extension, not the hosted website. Unpacked 0.5.0 users
must replace the installed folder contents with 0.5.1 and reload the extension in
chrome://extensions. Keep the folder in its final location. Do this outside a call.
Alternatively disable the old extension and load the new unpacked folder.

The unit regression exercises rapid clicks, window reuse without navigation,
service-worker restart, closed windows and rejection of foreign messages. A mocked
Chrome API cannot establish click-to-window latency on a user's physical laptop.

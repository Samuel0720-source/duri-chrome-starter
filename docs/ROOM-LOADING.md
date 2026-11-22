# Room opening latency

Opening the extension loads the authenticated web route again. Previously the page,
persistent call layout, and wallpaper shell independently read the user, membership,
and room. The wallpaper reads only started after the page had finished its reads.

`src/lib/room-render.ts` now shares verified identity, room details and member count
within one React Server Component request. Room and count reads run concurrently.
All six room pages, the call layout and the wallpaper shell use these helpers.
React `cache` expires at the request boundary; no private data is persisted or shared
between visitors. Proxy cookie refresh, `getUser`, RLS and fresh mutation checks
remain in place. The call dock remains in its persistent layout.

The renderer regression test runs the real React server renderer with a fake database:
three consumers perform one identity/seat/room/count read, concurrent users are
isolated, the next request revalidates, and guests never read private room tables.
The live native-extension test records time from opening the popup to the authenticated
home being visible. This measurement is environment-specific, not a client SLA.

This is a website change; an extension already embedding the website needs no new
package. Close and reopen it after deployment. Local machine/VPN/browser delays and
cold starts have not been ruled out by this code change.

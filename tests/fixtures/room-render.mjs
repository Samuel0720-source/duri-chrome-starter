// Execute with --conditions=react-server: exercise React's real request cache.
import { registerHooks } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/server.node.js';

const requests = new AsyncLocalStorage();
globalThis.__roomTestClient = () => {
  const state = requests.getStore();
  return {
    auth: { getUser: async () => { state.auth++; return { data: { user: state.user ? { id: state.user } : null } }; } },
    from(table) {
      let head = false;
      const result = () => {
        if (table === 'couple_rooms') { state.room++; return { data: { id: state.user + '-room', wallpaper: state.user } }; }
        if (head) { state.count++; return { count: 2 }; }
        state.seat++; return { data: { room_id: state.user + '-room' } };
      };
      return {
        select(_, options) { head = !!options?.head; return this; },
        eq() { return this; },
        async maybeSingle() { return result(); },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
    },
  };
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './supabase/server' && context.parentURL.endsWith('/room-render.ts')) {
    return { url: 'data:text/javascript,export async function serverClient(){return globalThis.__roomTestClient()}', shortCircuit: true };
  }
  return next(specifier, context);
} });
const { roomAccess, roomDetails, roomMemberCount } = await import('../../src/lib/room-render.ts');
async function Layer() {
  const [access, room, count] = await Promise.all([roomAccess(), roomDetails(), roomMemberCount()]);
  // Like RoomShell, this read happens after the page's initial work.
  assert.deepEqual(await roomDetails(), room);
  return JSON.stringify({ user: access.auth.user?.id, room: room?.id, count });
}
async function request(user) {
  const state = { user, auth: 0, room: 0, seat: 0, count: 0 };
  return requests.run(state, async () => {
    const stream = await renderToReadableStream(createElement('main', null, createElement(Layer), createElement(Layer), createElement(Layer)), {});
    const body = await new Response(stream).text();
    assert.deepEqual(state, { user, auth: 1, room: user ? 1 : 0, seat: user ? 1 : 0, count: user ? 1 : 0 });
    if (user) assert.ok(body.includes(user + '-room'));
    return body;
  });
}
const [alice, bob] = await Promise.all([request('alice'), request('bob')]);
assert.ok(!alice.includes('bob-room'));
assert.ok(!bob.includes('alice-room'));
await request('alice'); // A new request must perform all authorization again.
await request(null); // Guests must not query private room tables.
console.log('Request-scoped reads: deduplicated, isolated, revalidated, guest-safe.');

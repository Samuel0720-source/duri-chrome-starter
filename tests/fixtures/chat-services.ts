// Test-only in-memory transport; production Chat/CallControls and CSS are unchanged.
const listeners: Record<string, (e: { payload: object }) => void> = {};
let rows: object[] = [];
let id = 50;
let fail = false;
const channel = {
  on(_kind: string, filter: { event: string }, fn: (e: { payload: object }) => void) { listeners[filter.event] = fn; return channel; },
  subscribe(fn: (status: string) => void) { fn('SUBSCRIBED'); return channel; },
};
const client = {
  realtime: { setAuth: async () => {} },
  channel: () => channel, removeChannel: async () => {},
  from() {
    const query = { select: () => query, eq: () => query, neq: () => query, gt: () => query, order: () => query,
      limit: async () => ({ data: rows }), maybeSingle: async () => ({ data: null }) };
    return query;
  },
  async rpc(name: string) {
    if (name === 'send_room_message') return fail ? { error: { message: 'Unavailable' } } : { data: ++id };
    return {};
  },
};
const router = { refresh() {} };
export const useRouter = () => router;
export const browserClient = () => client;
Object.assign(window, {
  receiveMessage() { rows = [{ id: ++id, sender: 'partner', body: 'A new reply', created_at: new Date().toISOString() }]; listeners.messages?.({ payload: {} }); },
  failChat(value: boolean) { fail = value; },
});

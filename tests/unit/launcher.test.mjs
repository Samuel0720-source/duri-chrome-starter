import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildExtension } from '../../scripts/build-extension.mjs';

test('toolbar opens one direct small window, reuses it without navigation, restores after worker restart', async () => {
  const out = await mkdtemp(join(tmpdir(), 'duri-launch-'));
  let click, message, removed, id = 0, creates = [], updates = [], saved = {}, failResize = false;
  const windows = new Map();
  globalThis.chrome = {
    action: { onClicked: { addListener: fn => { click = fn; } }, setBadgeText: async () => {} },
    runtime: { id: 'test', getURL: p => 'chrome-extension://test/' + p,
      onConnect: { addListener() {} }, onMessage: { addListener: fn => { message = fn; } } },
    storage: { session: { get: async () => saved, set: async data => { saved = data; } } },
    windows: {
      onRemoved: { addListener: fn => { removed = fn; } },
      // Simulate Chrome restoring unexpected bounds, despite the create request.
      create: async opts => { creates.push(opts); const win = { id: ++id, type: opts.type, state: 'maximized', width: 1440, height: 900 }; windows.set(id, win); return win; },
      get: async id => { if (!windows.has(id)) throw Error('Closed'); return windows.get(id); },
      update: async (id, opts) => { if (failResize) throw Error('Resize failed'); updates.push({ id, ...opts }); Object.assign(windows.get(id), opts); },
    },
  };
  try {
    await buildExtension('https://duri.example', out);
    const script = pathToFileURL(join(out, 'background.js')).href;
    await import(script);
    await Promise.all([click(), click(), click()]);
    assert.deepEqual(creates, [{ url: 'https://duri.example/room?mini=1', type: 'popup', state: 'normal', width: 440, height: 600, focused: true }]);
    assert.deepEqual(windows.get(1), { id: 1, type: 'popup', state: 'normal', width: 440, height: 600, focused: true });
    updates = [];
    Object.assign(windows.get(1), { state: 'fullscreen', width: 1920, height: 1080 });
    await click();
    assert.deepEqual(updates, [{ id: 1, state: 'normal' }, { id: 1, focused: true, width: 440, height: 600 }]);
    failResize = true;
    const failed = await new Promise(resolve => message({ duri: 'open-small', path: '/room/chat' }, { id: 'test', url: 'https://duri.example/room/chat' }, resolve));
    assert.deepEqual(failed, { ok: false });
    assert.equal(creates.length, 1, 'a resize failure must not duplicate an active call window');
    failResize = false;
    await import(script + '?worker-restarted');
    await click();
    assert.equal(creates.length, 1);
    windows.delete(1); removed(1);
    await click();
    assert.equal(creates.length, 2);
    // Foreign messages may not open a window.
    assert.equal(message({ duri: 'open-small' }, { id: 'other', url: 'https://duri.example/' }, () => assert.fail()), undefined);
    assert.equal(creates.length, 2);
  } finally { delete globalThis.chrome; await rm(out, { recursive: true, force: true }); }
});

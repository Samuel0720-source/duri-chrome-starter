import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { surfacePath } from '../../extension/surface-path.js';
const source = (await readFile(new URL('../../extension/popup.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
function popup(cached = null, rejected = false) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { dataset:{}, handlers:{}, setAttribute(){}, addEventListener(name, fn) { this.handlers[name] = fn; }, contentWindow:{postMessage(){}} });
    return elements.get(id);
  }
  const timers = [];
  let finish;
  const stored = new Promise(resolve => { finish = resolve; });
  const document = { documentElement:element('html'), body:element('body'), querySelector:query => element(query.slice(1)), getElementById:element };
  runInNewContext(source, {
    document, navigator:{language:'en'}, window:{addEventListener(){}}, webOrigin:'https://duri.example', surfacePath,
    localStorage:{getItem:() => cached, setItem(){}},
    chrome:{storage:{local:{get:() => rejected ? Promise.reject(new Error('storage')) : stored}},runtime:{sendMessage:async () => ({ok:false})},tabs:{create(){}}},
    setTimeout(fn, ms) { timers.push({fn,ms}); return timers.length; }, clearTimeout(){},
  });
  return {element, timers, finish};
}
test('popup starts within its 100ms preference deadline even if storage never resolves; late settings cannot redirect it', async () => {
  const p = popup();
  assert.equal(typeof p.element('detach').handlers.click, 'function');
  p.timers.find(t => t.ms === 100).fn();
  assert.equal(p.element('app').src, 'https://duri.example/room');
  p.finish({surface:{path:'/room/settings',locale:'ko'}});
  await Promise.resolve();
  assert.equal(p.element('app').src, 'https://duri.example/room');
  await p.element('detach').handlers.click();
  assert.equal(p.element('state').hidden, false);
  assert.match(p.element('state').textContent, /Check your connection/);
});
test('cached presentation opens immediately; rejected or corrupt storage still opens a usable popup', async () => {
  const fast = popup(JSON.stringify({path:'/room/chat',locale:'en',mood:'night'}));
  assert.equal(fast.element('app').src, 'https://duri.example/room/chat');
  assert.equal(fast.element('body').dataset.mood, 'night');
  const broken = popup('bad-json', true);
  await Promise.resolve();
  assert.equal(broken.element('app').src, 'https://duri.example/room');
});

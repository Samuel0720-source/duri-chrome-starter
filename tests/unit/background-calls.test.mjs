import test from 'node:test';
import assert from 'node:assert/strict';
import { callMessage } from '../../extension/call-background.js';

test('background calls create one hidden host, reject unrelated senders and clean up without opening windows', async () => {
  const origin='https://duri.example';
  let contexts=[],created=[],closed=0,badge=[];
  globalThis.chrome={
    runtime:{getURL:p=>'chrome-extension://test/'+p,getContexts:async()=>contexts},
    offscreen:{createDocument:async options=>{created.push(options);await new Promise(r=>setTimeout(r,5));contexts=[{}];},closeDocument:async()=>{closed++;contexts=[];}},
    action:{setBadgeText:async data=>badge.push(data.text),setBadgeBackgroundColor:async()=>{}},
    windows:{create:()=>assert.fail('Calls must not open a visible window')},
  };
  const sender={url:origin+'/room/chat'};
  const ensure=()=>new Promise(resolve=>callMessage({duri:'call-host-ensure'},sender,resolve,origin));
  try {
    assert.deepEqual(await Promise.all([ensure(),ensure(),ensure()]),[{ok:true},{ok:true},{ok:true}]);
    assert.equal(created.length,1);
    assert.deepEqual(created[0].reasons,['WEB_RTC','USER_MEDIA']);
    await ensure();assert.equal(created.length,1);
    assert.equal(callMessage({duri:'call-host-ensure'},{url:'https://other.example/room'},()=>assert.fail(),origin),undefined);
    callMessage({duri:'call-host-state',phase:'connected'},sender,()=>{},origin);assert.equal(badge.length,0);
    callMessage({duri:'call-host-close'},sender,()=>{},origin);assert.equal(closed,0);
    callMessage({duri:'call-host-state',phase:'connected'},{url:'chrome-extension://test/offscreen.html'},()=>{},origin);assert.deepEqual(badge,['☎']);
    callMessage({duri:'call-host-close'},{url:origin+'/login'},()=>{},origin);
    await new Promise(r=>setImmediate(r));assert.equal(closed,1);assert.equal(badge.at(-1),'');
    chrome.offscreen.createDocument=async()=>{throw Error('Unavailable');};
    assert.deepEqual(await ensure(),{ok:false});
  } finally { delete globalThis.chrome; }
});

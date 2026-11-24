import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('lib/community-online-notice.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(extra={}){const ctx={exports:{},...extra};vm.runInNewContext(code,ctx);return ctx.exports;}

test('online alerts ignore self, snapshots, duplicates, offline events and active Community',()=>{
 const {createOnlineNoticeGate}=load();const gate=createOnlineNoticeGate('self');
 assert.equal(gate.update('a',true,false,0),false);
 gate.snapshot(['self','a']);
 assert.equal(gate.update('self',true,false,0),false);
 assert.equal(gate.update('a',true,false,0),false);
 assert.equal(gate.update('b',true,true,0),false);
 assert.equal(gate.update('c',true,false,0),true);
 assert.equal(gate.update('c',true,false,200000),false);
 assert.equal(gate.update('c',false,false,200000),false);
 assert.equal(gate.update('c',true,false,200001),false);
 gate.snapshot(['a','b','c']);
 assert.equal(gate.update('c',true,false,1000000),false);
});
test('notices are limited across people and each repeated arrival',()=>{
 const gate=load().createOnlineNoticeGate('self');gate.snapshot([]);
 assert.equal(gate.update('a',true,false,0),true);
 assert.equal(gate.update('b',true,false,500),false);
 assert.equal(gate.update('c',true,false,120001),true);
 gate.update('a',false,false,200000);
 assert.equal(gate.update('a',true,false,900001),true);
});
test('system notice contains only anonymous copy and a generic action; denied permission stays silent',async()=>{
 const notices=[];
 const ctx={window:{Notification:{}},Notification:{permission:'granted'},navigator:{serviceWorker:{getRegistration:async()=>({showNotification:async(...args)=>notices.push(args)})}}};
 const api=load(ctx);assert.equal(await api.showOnlineSystemNotice(),true);
 assert.equal(notices.length,1);assert.equal(notices[0][0],api.ONLINE_NOTICE.title);
 assert.equal(JSON.stringify(notices[0][1].data),JSON.stringify({action:'zyrava:open-community'}));
 ctx.Notification.permission='denied';assert.equal(await api.showOnlineSystemNotice(),false);assert.equal(notices.length,1);
});
test('tapping a tray alert focuses the existing player and opens Community without navigating it',async()=>{
 const handlers={};const events=[];
 const self={addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async()=>[{focused:true,focus:async()=>events.push('focus'),postMessage:msg=>events.push(msg.type)}],openWindow:async url=>events.push(url)}};
 vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),{self});
 let done;handlers.notificationclick({notification:{data:{action:'zyrava:open-community'},close:()=>events.push('close')},waitUntil:p=>done=p});await done;
 assert.deepEqual(events,['close','focus','zyrava:open-community']);
 self.clients.matchAll=async()=>[];
 handlers.notificationclick({notification:{data:{action:'zyrava:open-community'},close:()=>{}},waitUntil:p=>done=p});await done;
 assert.equal(events.at(-1),'/?community=1');
});

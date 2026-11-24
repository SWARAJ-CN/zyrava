import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/community-messages.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const {mergeMessage,applyReadReceipt}=exports;
const outgoing={id:'out',clientId:'client',mine:true,text:'Hello',seen:false};
const incoming={id:'in',mine:false,text:'Reply',seen:false};

test('peer read receipts mark only identified outgoing messages',()=>{
 const result=applyReadReceipt([outgoing,incoming,{...outgoing,id:'new'}],['out','in'],false);
 assert.equal(result[0].seen,true);assert.equal(result[1].seen,false);assert.equal(result[2].seen,false);
 const own=applyReadReceipt(result,['in'],true);
 assert.equal(own[1].seen,true);
});

test('a delayed send acknowledgement or history fetch cannot undo Seen',()=>{
 const optimistic={...outgoing,id:'local:client',pending:true};
 const confirmed=mergeMessage([optimistic],outgoing);
 const read=applyReadReceipt(confirmed,['out'],false);
 const delayed=mergeMessage(read,outgoing);
 assert.equal(delayed.length,1);assert.equal(delayed[0].seen,true);assert.equal(delayed[0].pending,false);
});

const source=ts.createSourceFile('provider.tsx',fs.readFileSync('components/providers/CommunityProvider.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let effect;
function visit(node){
 if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('const acknowledge ='))effect=node.arguments[0].getText(source);
 ts.forEachChild(node,visit);
}
visit(source);assert.ok(effect);
const code=ts.transpile(`(${effect})()`,{target:ts.ScriptTarget.ES2022});
function fixture({hidden=false,focused=true,open=true}={}){
 const calls=[];const events={};
 const ctx={ready:true,chatOpen:open,viewActiveId:'thread',currentId:'owner',userIdRef:{current:'owner'},
 viewMessageMap:{thread:[outgoing,incoming,{...incoming,id:'already-read',seen:true}]},
 readInFlightRef:{current:new Set()},document:{hidden,hasFocus:()=>focused,addEventListener:(name,fn)=>{events[name]=fn},removeEventListener:()=>{}},
 window:{addEventListener:(name,fn)=>{events[name]=fn},removeEventListener:()=>{}},
 markConversationRead:(conversationId,ids)=>{calls.push({conversationId,ids});return Promise.resolve({conversationId,messageIds:ids,unread:0});},
 receiveReadReceipt:()=>{},
 };
 const cleanup=vm.runInNewContext(code,ctx);return {ctx,calls,events,cleanup};
}
test('hidden, unfocused, and closed chats do not send read acknowledgements',()=>{
 for(const options of [{hidden:true},{focused:false},{open:false}])assert.equal(fixture(options).calls.length,0);
});
test('foreground chat acknowledges incoming unread IDs once, including on returning to the app',async()=>{
 const f=fixture({hidden:true});f.ctx.document.hidden=false;f.events.visibilitychange();f.events.focus();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].conversationId,'thread');assert.deepEqual(Array.from(f.calls[0].ids),['in']);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(f.ctx.readInFlightRef.current.size,0);
 f.cleanup();
});

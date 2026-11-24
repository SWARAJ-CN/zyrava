import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function harness(){
 const voices=[];let now=0,created=0,closed=0;
 const ctx={exports:{},Date:{now:()=>now},Math:{random:()=>0,floor:Math.floor},window:{AudioContext:class{
  state='suspended';currentTime=0;destination={};
  constructor(){created++;}
  resume(){this.state='running';return Promise.resolve();}
  close(){closed++;this.state='closed';return Promise.resolve();}
  createOscillator(){const osc={frequency:{value:0},connect(){},disconnect(){},start(at){this.at=at;},stop(at){this.until=at;}};voices.push(osc);return osc;}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(value){assert.ok(value<=0.065)},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/message-chime.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return {chime:ctx.exports.createMessageChime(),voices,advance:()=>now+=1300,counts:()=>({created,closed})};
}
test('message chimes wait for a gesture, vary without consecutive repeats, and throttle bursts',()=>{
 const h=harness();h.chime.play();assert.equal(h.voices.length,0);assert.equal(h.counts().created,0);
 h.chime.unlock();assert.equal(h.voices.length,0);
 h.chime.play();assert.equal(h.voices.length,2);
 h.chime.play();assert.equal(h.voices.length,2);
 h.advance();h.chime.play();assert.equal(h.voices.length,4);
 assert.notEqual(h.voices[0].frequency.value,h.voices[2].frequency.value);
 assert.ok(h.voices.every(v=>v.until-v.at<0.3));
 h.chime.unlock();assert.equal(h.counts().created,1);
 h.chime.dispose();assert.equal(h.counts().closed,1);
 h.advance();h.chime.play();h.chime.unlock();assert.equal(h.voices.length,4);assert.equal(h.counts().created,1);
});

const provider=ts.createSourceFile('community.tsx',fs.readFileSync('components/providers/CommunityProvider.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(provider)==='onCommunityEvent'&&node.arguments[0]?.text==='message:new')handler=node.arguments[1].getText(provider);ts.forEachChild(node,visit);}visit(provider);assert.ok(handler);
function notifications({open=false,active=null,hidden=false,enabled=true}={}){
 const events=[];const ctx={
  receivedIdsRef:{current:new Set()},seenIdsRef:{current:new Set()},setMessagesByConversation:()=>{},
  chatOpenRef:{current:open},activeIdRef:{current:active},document:{hidden,hasFocus:()=>true},
  conversationsRef:{current:[{id:'thread',user:{name:'Friend'}}]},setConversations:()=>{},
  setRemoteUnread:()=>events.push('badge'),messageSoundEnabledRef:{current:enabled},
  messageChimeRef:{current:{play:()=>events.push('sound')}},toast:{toast:()=>events.push('toast')},
 };
 const receive=vm.runInNewContext(ts.transpile(`(${handler})`,{target:ts.ScriptTarget.ES2022}),ctx);
 return {events,receive:(mine=false)=>receive({message:{id:'message',conversationId:'thread',text:'Hello',mine}})};
}
test('incoming alerts get a sound and toast once; outgoing and actively read messages stay quiet',()=>{
 const h=notifications();h.receive();h.receive();assert.deepEqual(h.events,['badge','sound','toast']);
 const mine=notifications();mine.receive(true);assert.deepEqual(mine.events,[]);
 const reading=notifications({open:true,active:'thread'});reading.receive();assert.deepEqual(reading.events,[]);
 const other=notifications({open:true,active:'different'});other.receive();assert.deepEqual(other.events,['sound','toast']);
 const muted=notifications({enabled:false});muted.receive();assert.deepEqual(muted.events,['badge','toast']);
 const hidden=notifications({open:true,active:'thread',hidden:true});hidden.receive();assert.deepEqual(hidden.events,['badge','sound','toast']);
});

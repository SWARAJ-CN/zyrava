import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = ts.createSourceFile('community.tsx', fs.readFileSync('components/providers/CommunityProvider.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name) {
  let result;
  function visit(node) {
    if (name === 'history' && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('const onBack')) result = node.arguments[0];
    else if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, name);
  return ts.transpile(`(${result.getText(source)})`, {target:ts.ScriptTarget.ES2022});
}
function harness() {
  const entries = [{__NA:true, underlyingRoute:'/'}];
  let index = 0;
  const listeners = new Map();
  const state = {open:false, active:null};
  const history = {
    get state() {return entries[index];},
    pushState(value) {entries.splice(++index, entries.length, value);},
    replaceState(value) {entries[index] = value;},
    go(delta) {assert.ok(index + delta >= 0, 'must not navigate outside the music app'); index += delta; listeners.get('popstate')?.();},
    back() {this.go(-1);},
  };
  const noop = () => {};
  const ctx = {
    window: {history,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    currentId:'listener', userIdRef:{current:'listener'}, chatOpenRef:{current:false},
    setChatOpen:open=>{state.open=open;}, setActiveId:id=>{state.active=id;},
    setLoading:noop,setError:noop,setPeople:noop,setConversations:noop,
    refreshThreads:()=>Promise.resolve([]),fetchPeople:()=>Promise.resolve([]),
    messagesByConversation:{a:[],b:[]},markConversationRead:()=>Promise.resolve(),
  };
  const run = name => vm.runInNewContext(extract(name),ctx);
  run('history')();
  return {ctx,state,history,entries,open:run('openChat'),close:run('closeChat'),select:run('selectConversation')};
}

test('opening Community twice creates one Back step and preserves router state', () => {
  const h = harness();h.open();h.open();
  assert.equal(h.entries.length,2);
  assert.equal(h.history.state.__NA,true);
  h.history.back();
  assert.equal(h.state.open,false);
  assert.equal(h.history.state.underlyingRoute,'/');
});

test('Back navigates from conversation to chats to music; switching threads does not stack history', () => {
  const h = harness();h.open();h.select('a');h.select('b');
  assert.equal(h.entries.length,3);
  h.history.back();assert.equal(h.state.open,true);assert.equal(h.state.active,null);
  h.history.back();assert.equal(h.state.open,false);
  h.history.go(1);assert.equal(h.state.open,true);
  h.history.go(1);assert.equal(h.state.active,'b');
  h.close();assert.equal(h.state.open,false);assert.equal(h.history.state.underlyingRoute,'/');
});

test('the conversation Back button consumes its entry; a previous account cannot reopen chat via Forward', () => {
  const h = harness();h.open();h.select('a');h.select(null);
  assert.equal(h.state.open,true);assert.equal(h.state.active,null);
  h.close();h.ctx.userIdRef.current='another-listener';h.history.go(1);
  assert.equal(h.state.open,false);
});

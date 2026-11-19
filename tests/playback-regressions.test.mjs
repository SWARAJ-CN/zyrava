import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production callbacks with browser/player boundaries stubbed.
// No network calls or real payment/account mutations are involved.
const source = ts.createSourceFile('player.tsx', fs.readFileSync('components/providers/MusicPlayerProvider.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(found, `${name} exists`);
  return ts.transpile(`(${found})`, { target: ts.ScriptTarget.ES2020 });
}
function player(overrides = {}) {
  const events = [];
  const audio = { currentTime: 0, play: () => { events.push('play'); return Promise.resolve(); } };
  const ctx = {
    index: 9, queue: Array.from({length: 10}, (_, id) => ({id})),
    audioRef: {current: audio}, shuffle: false, isGuest: false,
    shouldPlayRef: {current: false}, userPausedRef: {current: false}, pendingEndRef: {current: false},
    queueEndRef: {current: () => { events.push('page'); return true; }},
    setIndex: i => events.push(['index', i]), stop: () => events.push('stop'),
    requestLogin: () => events.push('login'), recoverPlayback: () => {},
    ...overrides,
  };
  return {ctx, events, step: vm.runInNewContext(callback('stepTrack'), ctx)};
}
test('manual Next requests another page without wrapping to track one', () => {
  const p = player(); p.step(1);
  assert.deepEqual(p.events, ['page']);
  assert.equal(p.ctx.pendingEndRef.current, true);
});
test('Next within a page advances without a page request', () => {
  const p = player({index: 4}); p.step(1);
  assert.equal(JSON.stringify(p.events), '[["index",5]]');
});
test('guest queue boundary still stops and requests sign-in', () => {
  const p = player({isGuest: true}); p.step(1);
  assert.deepEqual(p.events, ['stop', 'login']);
});
test('exhausted single-track queue restarts the same audio element', () => {
  const p = player({index: 0, queue: [{id:1}], queueEndRef: {current: () => false}}); p.step(1);
  assert.deepEqual(p.events, ['play']);
});
test('failed page extension releases pending advance and permits wrapping', () => {
  const p = player({pendingEndRef: {current: true}, queueEndRef: {current: () => false}}); p.step(1);
  assert.equal(p.ctx.pendingEndRef.current, false);
  assert.equal(JSON.stringify(p.events), '[["index",0]]');
});
test('Previous after three seconds restarts without changing the queue', () => {
  const p = player(); p.ctx.audioRef.current.currentTime = 12; p.step(-1);
  assert.equal(p.ctx.audioRef.current.currentTime, 0);
  assert.deepEqual(p.events, []);
});
test('background queue arrival advances without an animation frame', () => {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('if (!pendingEndRef.current || index + 1 >= queue.length)')) effect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(effect);
  const p = player({queue: Array.from({length:20}, (_,id) => ({id})), pendingEndRef: {current:true}});
  vm.runInNewContext(ts.transpile(`(${effect})()`), p.ctx);
  assert.equal(JSON.stringify(p.events), '[["index",10]]');
  assert.equal(p.ctx.pendingEndRef.current, false);
});

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

test('suspended or missing audio context never captures audible native playback', () => {
  for (const context of [null, { state: 'suspended' }, { state: 'closed' }]) {
    const audio = { volume: 0.7, muted: false };
    const ensure = vm.runInNewContext(callback('ensureGraph'), {
      audioRef: { current: audio }, audioContextRef: { current: null },
      analyserRef: { current: null }, preparedContextRef: { current: context },
    });
    assert.equal(ensure(), null);
    assert.deepEqual(audio, { volume: 0.7, muted: false });
  }
});

test('gesture preparation resumes and reuses one context without binding the media element', () => {
  let created = 0;
  let resumed = 0;
  const ctx = {
    audioContextRef: { current: null }, preparedContextRef: { current: null },
    window: { AudioContext: class {
      state = 'suspended';
      constructor() { created++; }
      resume() { resumed++; return Promise.resolve(); }
    } },
  };
  const prepare = vm.runInNewContext(callback('prepareAudioContext'), ctx);
  assert.equal(prepare(), prepare());
  assert.equal(created, 1);
  assert.equal(resumed, 2);
});

function graphHarness(fail = false) {
  const calls = [];
  const node = () => ({ gain: { value: 0 }, pan: {}, frequency: {}, connect: () => {}, disconnect: () => {} });
  const context = {
    state: 'running', destination: {},
    createGain: node, createBiquadFilter: node, createAnalyser: node, createChannelSplitter: node,
    createStereoPanner: () => { if (fail) throw new Error('Unavailable node'); return node(); },
    createMediaElementSource: () => { calls.push('bound'); return node(); },
  };
  const ctx = Object.fromEntries([...callback('ensureGraph').matchAll(/\b(\w+Ref)\b/g)].map(([, name]) => [name, { current: null }]));
  Object.assign(ctx, {
    audioRef: { current: { volume: 0.7, muted: false } },
    preparedContextRef: { current: context },
    preampDbRef: { current: 0 }, volumeRef: { current: 0.7 }, mutedRef: { current: false },
    balanceRef: { current: 0 }, loCutRef: { current: false },
    masterLevel: v => v, appliedVolume: v => v, applyFX: () => {}, applyRouting: () => {},
  });
  return { ctx, calls, ensure: vm.runInNewContext(callback('ensureGraph'), ctx) };
}

test('running gesture-unlocked graph connects once and keeps the master volume', () => {
  const h = graphHarness();
  assert.ok(h.ensure());
  assert.ok(h.ensure());
  assert.deepEqual(h.calls, ['bound']);
  assert.equal(h.ctx.masterGainRef.current.gain.value, 0.7);
  assert.equal(h.ctx.audioRef.current.volume, 1);
});

test('unsupported graph nodes leave native sound and volume intact', () => {
  const h = graphHarness(true);
  assert.equal(h.ensure(), null);
  assert.deepEqual(h.calls, []);
  assert.equal(h.ctx.audioRef.current.volume, 0.7);
  assert.equal(h.ctx.masterGainRef.current, null);
});

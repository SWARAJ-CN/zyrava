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
    queueLabel: 'Feed', index: 9, queue: Array.from({length: 10}, (_, id) => ({id})),
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
    audioContextRef: { current: null }, preparedContextRef: { current: null }, activateGraphRef: {current:null},
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
    preparedContextRef: { current: context }, graphWantedRef: { current: true },
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

function playerMemory() {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('lib/player-memory.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', code)(loaded.exports);
  return loaded.exports;
}

test('last played song and progress survive reload with safe position bounds', () => {
  const { readLastPlayed, serializeLastPlayed } = playerMemory();
  const song = { id: 'song1', title: 'Latest song', artist: 'Artist', album: '', year: '', language: 'english', image: '', imageLarge: '', streamUrl: 'https://audio.example/song.mp4', pageUrl: '', duration: 200 };
  assert.deepEqual(readLastPlayed(serializeLastPlayed(song, 68)), { song, position: 68 });
  assert.equal(readLastPlayed(serializeLastPlayed(song, 500)).position, 200);
  assert.equal(readLastPlayed(serializeLastPlayed(song, -5)).position, 0);
  for (const value of [null, '{broken', '{}', JSON.stringify({ song: { ...song, streamUrl: 'blob:expired' } })]) {
    assert.equal(readLastPlayed(value), null);
  }
  const localSong = { ...song, streamUrl: '', offline: { kind: 'local', id: 'saved1' } };
  assert.equal(readLastPlayed(serializeLastPlayed(localSong, 20)).song.offline.id, 'saved1');
});

test('reload restores the last song paused and never replaces an incoming song link', () => {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('readLastPlayed(window.localStorage')) effect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(effect);
  const run = ts.transpile(`(${effect})()`, { target: ts.ScriptTarget.ES2022 });
  for (const incoming of [false, true]) {
    const events = [];
    const ctx = {
      memoryRestoredRef: { current: false }, currentRef: { current: null },
      shouldPlayRef: { current: incoming }, userPausedRef: { current: false },
      restoredPositionRef: { current: null }, LAST_PLAYED_KEY: 'last',
      readLastPlayed: () => ({ song: { id: 'latest', duration: 200 }, position: 70 }),
      window: { localStorage: { getItem: () => '{}' } },
      setTimeout: fn => { fn(); return 1; }, clearTimeout: () => {},
      setQueue: songs => events.push(songs[0].id), setQueueLabel: () => {}, setIndex: () => {},
      setDuration: () => {}, setProgress: n => events.push(n),
    };
    vm.runInNewContext(run, ctx);
    vm.runInNewContext(run, ctx);
    assert.deepEqual(events, incoming ? [] : ['latest', 70]);
    assert.equal(ctx.shouldPlayRef.current, incoming);
  }
});


test('ordinary mobile playback does not bind an unnecessary Web Audio graph', () => {
  const h = graphHarness();
  h.ctx.graphWantedRef.current = false;
  assert.equal(h.ensure(), null);
  assert.deepEqual(h.calls, []);
  assert.equal(h.ctx.audioRef.current.volume, 0.7);
  h.ctx.graphWantedRef.current = true;
  assert.ok(h.ensure());
  assert.deepEqual(h.calls, ['bound']);
});

test('notification Pause records intent even when the OS has already paused audio', () => {
  for (const paused of [true, false]) {
    const events = [];
    const ctx = {
      audioRef: { current: { paused, pause: () => events.push('pause') } },
      userPausedRef: { current: false }, shouldPlayRef: { current: true },
      pendingEndRef: { current: true }, clearRecovery: () => events.push('cancel retry'),
      setPlaying: value => events.push(value), navigator: { mediaSession: { playbackState: 'playing' } },
    };
    vm.runInNewContext(callback('pausePlayback'), ctx)();
    assert.equal(ctx.userPausedRef.current, true);
    assert.equal(ctx.shouldPlayRef.current, false);
    assert.equal(ctx.pendingEndRef.current, false);
    assert.equal(ctx.navigator.mediaSession.playbackState, 'paused');
    assert.deepEqual(events, ['cancel retry', 'pause', false]);
    ctx.recoveryRef = {current: null};
    ctx.swapUntilRef = {current: 0};
    ctx.window = {setTimeout: () => { throw new Error('Pause must cancel recovery'); }};
    vm.runInNewContext(callback('recoverPlayback'), ctx)();
  }
});

test('notification Play is explicit and does not toggle a running track off', () => {
  const events = [];
  const ctx = {
    audioRef: { current: { paused: false, play: () => { events.push('play'); return Promise.resolve(); } } },
    currentRef: { current: {id:'song'} },
    userPausedRef: { current: true }, shouldPlayRef: { current: false },
    clearRecovery: () => events.push('cancel retry'), audioContextRef: {current: null},
  };
  vm.runInNewContext(callback('playPlayback'), ctx)();
  assert.equal(ctx.shouldPlayRef.current, true);
  assert.equal(ctx.userPausedRef.current, false);
  assert.deepEqual(events, ['cancel retry', 'play']);
});

test('invalid metadata and an unsupported action do not disable notification Pause', () => {
  let effect;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('new MediaMetadata')) effect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const actions = {};
  let paused = false;
  const ctx = {
    current: {title:'Track',artist:'Artist',imageLarge:'bad'},
    navigator: {mediaSession: {setActionHandler: (name, handler) => {if(name === 'seekto')throw Error('Unsupported'); actions[name] = handler;}}},
    MediaMetadata: class {constructor(){throw Error('Invalid metadata');}},
    playPlayback: () => {}, pausePlayback: () => {paused = true;},
  };
  const cleanup = vm.runInNewContext(ts.transpile(`(${effect})()`), ctx);
  actions.pause();
  assert.equal(paused, true);
  cleanup();
  assert.equal(actions.pause, null);
});


test('Next on a restored player advances into appended feed songs without replaying the saved track', () => {
  const p=player({queueLabel:'Recently played',index:0,queue:[{id:'saved'},{id:'feed-a'},{id:'feed-b'}]});
  p.ctx.audioRef.current.currentTime=45;p.step(1);
  assert.equal(JSON.stringify(p.events),'[["index",1]]');
  assert.equal(p.ctx.audioRef.current.currentTime,45);
});

test('restored player waits for a loading feed and never restarts on an unavailable feed', () => {
  const p=player({queueLabel:'Recently played',index:0,queue:[{id:'saved'}]});
  p.ctx.audioRef.current.currentTime=45;p.step(1);
  assert.equal(p.ctx.pendingEndRef.current,true);assert.equal(p.ctx.audioRef.current.currentTime,45);
  p.ctx.queueEndRef.current=()=>false;p.ctx.setPlayerError=()=>{};p.step(1);
  assert.equal(p.ctx.pendingEndRef.current,false);assert.equal(p.ctx.audioRef.current.currentTime,45);
  assert.ok(!p.events.includes('play'));
});

test('home attaches the current feed to a restored queue, excluding the saved song and respecting other queues', () => {
  const page=ts.createSourceFile('page.tsx',fs.readFileSync('app/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let effect;
  function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(page)==='useEffect'&&node.arguments[0]?.getText(page).includes('queueLabel !== "Recently played"'))effect=node.arguments[0].getText(page);ts.forEachChild(node,visit);}
  visit(page);assert.ok(effect);
  const run=ts.transpile(`(${effect})()`);
  for(const override of [{},{isGuest:true},{fetching:true},{queueLabel:'Liked songs'},{error:'offline'}]){
    const appended=[];const ctx={isGuest:false,queueLabel:'Recently played',queue:[{id:'saved'}],fetching:false,error:null,songs:[{id:'saved'},{id:'a'},{id:'b'}],chain:{current:null},termKey:'Mix',batch:0,appendQueue:list=>appended.push(...list),...override};
    vm.runInNewContext(run,ctx);
    assert.deepEqual(appended.map(song=>song.id),Object.keys(override).length?[]:['a','b']);
    if(!Object.keys(override).length)assert.equal(ctx.chain.current.firstId,'saved');
  }
});

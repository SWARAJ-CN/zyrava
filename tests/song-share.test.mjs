import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(filename, require = () => { throw new Error('Unexpected import'); }, fetch) {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', source)(loaded, loaded.exports, require, fetch);
  return loaded.exports;
}
const sharing = load('lib/song-share.ts');

test('share text includes song, artist and the production site', () => {
  assert.equal(sharing.songShareText({ id: 'enigma01', title: 'The Child in Us', artist: 'Enigma' }),
    'The Child in Us — Enigma\nListen on ZYRAVA\nhttps://zyrava.vercel.app/song/enigma01');
});

test('artwork proxy accepts catalogue CDNs and rejects unrelated or private URLs', () => {
  for (const url of ['https://c.saavncdn.com/cover.jpg', 'https://i.scdn.co/image/123']) {
    assert.equal(sharing.allowedShareArtwork(url), true);
  }
  for (const url of ['http://c.saavncdn.com/a', 'https://localhost/a', 'https://127.0.0.1/a', 'https://saavncdn.com.evil.com/a', 'https://user:pass@c.saavncdn.com/a', 'https://c.saavncdn.com:8080/a', 'data:image/png,test']) {
    assert.equal(sharing.allowedShareArtwork(url), false);
  }
});

test('artwork route validates requests and serves only bounded raster images without redirects', async () => {
  let calls = 0;
  let mode = 'image';
  const { GET } = load('app/api/music/share-artwork/route.ts', () => sharing, async (_, options) => {
    calls++;
    assert.equal(options.redirect, 'error');
    if (mode === 'html') return new Response('<html>', { headers: { 'content-type': 'text/html' } });
    if (mode === 'large') return new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  });
  const request = (url) => new Request(`https://zyrava.vercel.app/api/music/share-artwork?url=${encodeURIComponent(url)}`);
  assert.equal((await GET(request('https://localhost/private'))).status, 400);
  assert.equal(calls, 0);
  const response = await GET(request('https://c.saavncdn.com/cover.jpg'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  mode = 'html';
  assert.equal((await GET(request('https://c.saavncdn.com/cover.jpg'))).status, 502);
  mode = 'large';
  assert.equal((await GET(request('https://c.saavncdn.com/cover.jpg'))).status, 413);
});

test('opens the native chooser synchronously with prepared artwork', async () => {
  const file = { name: 'song.png' };
  let called = false;
  const result = sharing.shareSongWithApps({ id: 'track01', title: 'Song', artist: 'Artist' }, file, {
    canShare: () => true,
    share: data => {
      called = true;
      assert.equal(data.files[0], file);
      assert.match(data.text, /https:\/\/zyrava.vercel.app/);
      return Promise.resolve();
    },
  });
  assert.equal(called, true, 'no network or await before the native chooser');
  await result;
});

test('native chooser shares title and link when artwork is not ready or file sharing is unsupported', async () => {
  for (const file of [undefined, { name: 'song.png' }]) {
    await sharing.shareSongWithApps({ id: 'track01', title: 'Song', artist: 'Artist' }, file, {
      canShare: () => false,
      share: data => {
        assert.equal(data.files, undefined);
        assert.equal(data.url, 'https://zyrava.vercel.app/song/track01');
        assert.equal(data.text, 'Song — Artist');
        return Promise.resolve();
      },
    });
  }
  assert.equal(sharing.shareSongWithApps({ id: 'track01', title: 'Song', artist: 'Artist' }, undefined, {}), null);
});


test('each recording has its own encoded ZYRAVA link', () => {
  assert.equal(sharing.songShareUrl({ id: 'j8hvJDPs' }), 'https://zyrava.vercel.app/song/j8hvJDPs');
  assert.notEqual(sharing.songShareUrl({ id: 'original' }), sharing.songShareUrl({ id: 'remix' }));
  assert.equal(sharing.songShareUrl({ id: 'a/b?c' }), 'https://zyrava.vercel.app/song/a%2Fb%3Fc');
});


test('opening a song link queues that recording once, without pausing it on rerender', () => {
  const source = ts.createSourceFile('SharedSongPage.tsx', fs.readFileSync('components/features/music/SharedSongPage.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect') effect = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(effect);
  const code = ts.transpile(`(${effect})()`, { target: ts.ScriptTarget.ES2022 });
  const run = new Function('song', 'started', 'current', 'playing', 'startQueue', 'togglePlay', code);
  const song = { id: 'j8hvJDPs', title: 'Let Me Love You' };
  const started = { current: null };
  let queues = 0;
  let toggles = 0;
  const queue = (songs, label, index) => { queues++; assert.equal(songs[0].id, song.id); assert.equal(index, 0); };
  const toggle = () => { toggles++; };
  run(song, started, null, false, queue, toggle);
  run(song, started, song, true, queue, toggle);
  run(song, started, song, false, queue, toggle);
  assert.equal(queues, 1);
  assert.equal(toggles, 0);
});

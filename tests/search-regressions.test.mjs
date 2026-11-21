import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function loader({ fetch, bases = '', mocks = {} } = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} }; cache.set(filename, loaded);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), `${name}.ts`));
      return require(name);
    };
    new Function('module', 'exports', 'require', 'fetch', 'process', source)(loaded, loaded.exports, localRequire, fetch, { env: { MUSIC_API: bases } });
    return loaded.exports;
  }
  return load;
}
const ranker = loader()('lib/search-relevance.ts');
const song = (id, title = 'The Child In Us', artist = 'Enigma', album = 'Le Roi Est Mort, Vive Le Roi!') => ({
  id, title, artist, album, duration: 290, year: '1996', language: 'english', image: '', imageLarge: '', streamUrl: 'https://audio.example/song.mp3', pageUrl: '',
});
const original = song('original');
const instrumental = song('instrumental', 'The Child In Us (Enigma)', 'Instrumental Love Songs');
const remix = song('remix', 'The Child In Us (Remix)');

test('exact original outranks covers and tolerates an artist transposition', () => {
  for (const query of ['The Child in Us', 'The Child in Us by Enigma', 'The Child in Us by engima', 'The Child in Us Enigma', 'Enigma The Child in Us']) {
    assert.equal(ranker.rankSearchResults([instrumental, remix, original], query)[0].id, 'original');
    assert.equal(ranker.searchRelevance(original, query).confident, true);
  }
  assert.equal(ranker.searchRelevance(song('hidden', 'The Child In Us', 'Instrumental Love Songs'), 'The Child in Us').confident, false);
});
test('explicit remixes and instrumentals remain searchable', () => {
  assert.equal(ranker.rankSearchResults([original, remix], 'The Child in Us remix')[0].id, 'remix');
  const karaoke = song('karaoke', 'The Child In Us (Karaoke)');
  assert.equal(ranker.rankSearchResults([original, karaoke], 'The Child In Us karaoke')[0].id, 'karaoke');
  assert.equal(ranker.normalizeSearch('  BÉYONCÉ — Halo! '), 'beyonce halo');
  assert.equal(ranker.searchIntent('Stand by Me').artist, '');
});
function raw(s) { return { id: s.id, name: s.title, artists: { primary: [{ name: s.artist }] }, album: { name: s.album }, duration: s.duration, downloadUrl: [{ quality: '320kbps', url: s.streamUrl }] }; }
const payload = (songs, total = songs.length) => Response.json({ success: true, data: { results: songs.map(raw), total } });

test('a successful but weak mirror response triggers a quality fallback, then keeps that source for pagination', async () => {
  const calls = [];
  const load = loader({ bases: 'https://weak.example/api,https://good.example/api', fetch: async (url) => {
    calls.push(new URL(url));
    if (url.hostname === 'weak.example') return payload([instrumental]);
    if (url.hostname === 'good.example') {
      const page = Number(url.searchParams.get('page'));
      if (page === 1) return payload([original, ...Array.from({length: 29}, (_, i) => song(`s${i}`, `Other ${i}`))], 60);
      return payload(Array.from({length: 30}, (_, i) => song(`tail${i}`, `Tail ${i}`)), 60);
    }
    throw new Error('direct source temporarily unavailable');
  }});
  const api = load('lib/saavn.ts');
  const first = await api.searchSongs('The Child in Us by engima', 10, 1);
  assert.equal(first.songs[0].id, 'original');
  const count = calls.length;
  const suggestions = await api.searchSongs('The Child in Us by engima', 6, 1);
  assert.deepEqual(suggestions.songs, first.songs.slice(0, 6));
  assert.equal(calls.length, count, 'suggestions reuse the same quality decision');
  await api.searchSongs('The Child in Us by engima', 10, 4);
  assert.equal(calls.at(-1).hostname, 'good.example');
  assert.equal(calls.at(-1).searchParams.get('page'), '2');
});
test('title-only retrieval recovers an original excluded by the artist typo upstream', async () => {
  const load = loader({ bases: 'https://mirror.example/api', fetch: async (url) => {
    if (url.hostname !== 'mirror.example') throw new Error('unavailable');
    return payload(url.searchParams.get('query') === 'The Child in Us' ? [original] : [instrumental]);
  }});
  assert.equal((await load('lib/saavn.ts').searchSongs('The Child in Us by engima')).songs[0].id, 'original');
});
test('window pagination does not discard overfetched tracks and preserves recording variants', async () => {
  const load = loader({ bases: 'https://mirror.example', fetch: async (url) => {
    const page = Number(url.searchParams.get('page'));
    return payload(Array.from({length: 30}, (_, i) => song(String((page - 1) * 30 + i), `Track ${(page - 1) * 30 + i}`)), 60);
  }});
  const api = load('lib/saavn.ts');
  const pages = await Promise.all([1,2,3,4].map((page) => api.searchSongs('browse', 10, page, { quality: false })));
  assert.deepEqual(pages.flatMap(p => p.songs.map(s => s.id)), Array.from({length: 40}, (_, i) => String(i)));
  assert.equal(api.dedupeSongs([original, remix]).length, 2);
});
test('typed searches do not demote the requested artist for diversity', () => {
  const load = loader({ mocks: { '@/components/features/music/filters': { matchesRegions: () => false, matchesVibe: () => false } } });
  const songs = [instrumental, original, song('second'), song('third')];
  assert.deepEqual(load('lib/recommend.ts').rankSongs(songs, { query: 'The Child in Us by Enigma' }).slice(0,3).map(s => s.id), ['original','second','third']);
});

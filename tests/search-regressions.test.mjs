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

test('La Bouche originals outrank unrelated artists and unrequested club, house and 2023 mixes', () => {
  const exact = song('la-bouche', 'Be My Lover', 'La Bouche', 'Sweet Dreams');
  const others = [
    song('m4tt3rs', 'Be My Lover', 'M4TT3RS, Faber Arena, NFTwentyOne', 'Be My Lover'),
    song('sans-effort', 'Be My Lover', 'Sans Effort', 'Be My Lover'),
    song('house', 'Be My Lover (House Mix)', 'La Bouche', 'Sweet Dreams'),
    song('club', 'Be My Lover (Club Mix)', 'La Bouche', 'All Mixed Up'),
    song('2023', 'Be My Lover (2023 Mix)', 'Hypaton, David Guetta', 'Be My Lover (2023 Mix)'),
  ];
  for (const query of ['La bouche Be My Lover', 'Be My Lover La Bouche', 'Be My Lover by La Bouche']) {
    assert.equal(ranker.rankSearchResults([...others, exact], query)[0].id, exact.id);
    assert.ok(ranker.searchRelevance(exact, query).confident);
    assert.ok(others.every(s => !ranker.searchRelevance(s, query).confident));
  }
  // The album can identify a mix even if the upstream title omits the suffix.
  assert.equal(ranker.searchRelevance(song('hidden-mix', 'Be My Lover', 'La Bouche', 'Be My Lover (House Mix)'), 'Be My Lover').confident, false);
  assert.equal(ranker.rankSearchResults([exact, ...others], 'Be My Lover House Mix')[0].id, 'house');
  assert.equal(ranker.rankSearchResults([exact, ...others], 'Be My Lover 2023 Mix')[0].id, '2023');
});
function raw(s) { return { id: s.id, name: s.title, artists: { primary: [{ name: s.artist }] }, album: { name: s.album }, duration: s.duration, downloadUrl: [{ quality: '320kbps', url: s.streamUrl }] }; }
const payload = (songs, total = songs.length) => Response.json({ success: true, data: { results: songs.map(raw), total } });

function directPayload(songs) {
  const forge = require('node-forge');
  return Response.json({ total: songs.length, results: songs.map(s => {
    const cipher = forge.cipher.createCipher('DES-ECB', forge.util.createBuffer('38346591'));
    cipher.start({ iv: forge.util.createBuffer('00000000') });
    cipher.update(forge.util.createBuffer(s.streamUrl));
    cipher.finish();
    return { id: s.id, title: s.title, more_info: {
      album: s.album, duration: s.duration,
      encrypted_media_url: forge.util.encode64(cipher.output.getBytes()),
      artistMap: { primary_artists: [{ name: s.artist }] },
    } };
  }) });
}

test('typed searches consult the direct catalogue before a mirror with a same-title cover', async () => {
  const calls = [];
  const exact = song('la-bouche', 'Be My Lover', 'La Bouche', 'Sweet Dreams');
  const api = loader({ bases: 'https://limited.example/api', fetch: async url => {
    calls.push(url.hostname);
    return url.hostname === 'www.jiosaavn.com' ? directPayload([exact])
      : payload([song('cover', 'Be My Lover', 'Sans Effort', 'Be My Lover')]);
  } })('lib/saavn.ts');
  assert.equal((await api.searchSongs('Be My Lover', 10)).songs[0].artist, 'La Bouche');
  assert.deepEqual(calls, ['www.jiosaavn.com']);
  assert.equal((await api.searchSongs('La Bouche Be My Lover', 10)).songs[0].id, exact.id);
});

test('an empty regional catalogue still consults configured mirrors for the original', async () => {
  const exact = song('la-bouche', 'Be My Lover', 'La Bouche', 'Sweet Dreams');
  const api = loader({ bases: 'https://mirror.example/api', fetch: async url =>
    url.hostname === 'www.jiosaavn.com' ? directPayload([]) : payload([exact]),
  })('lib/saavn.ts');
  assert.equal((await api.searchSongs('La Bouche Be My Lover', 10)).songs[0].id, exact.id);
});

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

test('home defaults to Mix and shuffles across language pools without changing cached results', () => {
  const { REGIONS } = loader()('components/features/music/regions.ts');
  const { mixFeedPools } = loader()('lib/feed-mix.ts');
  assert.equal(REGIONS[0].label, 'Mix');
  assert.ok(REGIONS[0].queries.length > 1);
  const pools = [['en1', 'en2', 'en3'], ['hi1', 'hi2'], [], ['ta1', 'ta2']];
  const before = structuredClone(pools);
  const mixed = mixFeedPools(pools, () => 0);
  assert.deepEqual(pools, before);
  assert.deepEqual([...mixed].sort(), pools.flat().sort());
  assert.equal(new Set(mixed.slice(0, 3).map((id) => id.slice(0, 2))).size, 3);
  assert.notDeepEqual(mixed, mixFeedPools(pools, () => 0.99));
  assert.deepEqual(mixFeedPools([]), []);
});


test('shared song lookup retrieves the exact id, ignoring a mirror’s unrelated recording', async () => {
  const calls = [];
  const api = loader({ bases: 'https://wrong.example/api,https://good.example/api', fetch: async (url) => {
    const requested = new URL(url);
    calls.push(requested);
    if (requested.hostname === 'www.jiosaavn.com') return Response.json({ songs: [] });
    const songs = requested.hostname === 'wrong.example' ? [raw(remix)] : [raw(original)];
    return Response.json({ success: true, data: songs });
  } })('lib/saavn.ts');
  assert.equal((await api.getSongDetail('original')).id, 'original');
  assert.ok(calls.some(url => url.pathname === '/api/songs/original'));
  assert.ok(calls.some(url => url.searchParams.get('pids') === 'original'));
  assert.ok(calls.every(url => !url.pathname.includes('search')));
});

test('invalid or missing shared song ids never fall back to another track', async () => {
  let calls = 0;
  const api = loader({ fetch: async () => { calls++; return Response.json({ songs: [] }); } })('lib/saavn.ts');
  assert.equal(await api.getSongDetail('../private'), null);
  assert.equal(calls, 0);
  assert.equal(await api.getSongDetail('missing'), null);
  assert.equal(calls, 1);
});

test('Mix keeps chart leaders first, rotates languages, and removes duplicate recordings', () => {
  const { interleaveCharts } = loader()('lib/trending-mix.ts');
  const english = [song('en1', 'English one', 'A'), song('en2', 'English two', 'B')];
  const hindi = [song('hi1', 'Hindi one', 'C'), song('hi2', 'Hindi two', 'D')];
  const pools = [english, hindi, [english[0]]];
  assert.deepEqual(interleaveCharts(pools).map(s => s.id), ['en1', 'hi1', 'en2', 'hi2']);
  assert.deepEqual(english.map(s => s.id), ['en1', 'en2']);
  assert.deepEqual(interleaveCharts([]), []);
});

test('Mix chart requests are shared, cached, and tolerate a missing language chart', async () => {
  let calls = 0;
  const { dedupeSongs } = loader()('lib/saavn.ts');
  const { getTrendingMix } = loader({ mocks: { '@/lib/saavn': {
    dedupeSongs,
    getPlaylistDetail: async id => {
      calls++;
      if (id === '1134651042') throw new Error('Temporarily down');
      return { songs: [song(id, `Chart ${id}`, `Artist ${id}`)] };
    },
  } } })('lib/trending-mix.ts');
  const [first, second] = await Promise.all([getTrendingMix(), getTrendingMix()]);
  assert.equal(calls, 4);
  assert.equal(first.length, 3);
  assert.deepEqual(first, second);
  assert.deepEqual(await getTrendingMix(), first);
  assert.equal(calls, 4);
});

test('refreshing Trending Mix changes the selection without losing language variety', () => {
  const { pickFreshTrending, readMixHistory } = loader()('lib/feed-mix.ts');
  const pool = ['english', 'hindi', 'tamil', 'malayalam'].flatMap(language =>
    Array.from({ length: 8 }, (_, index) => ({ ...song(`${language}${index}`, `${language} ${index}`, `Artist ${index}`), language }))
  );
  const first = pickFreshTrending(pool, [], 10, () => 0.4);
  const history = JSON.stringify(first.map(song => song.id));
  const next = pickFreshTrending(pool, readMixHistory(history), 10, () => 0.4);
  assert.equal(first.length, 10);
  assert.equal(next.length, 10);
  assert.ok(next.every(song => !first.some(previous => previous.id === song.id)));
  assert.equal(new Set(next.map(song => song.language)).size, 4);
  assert.deepEqual(readMixHistory('invalid'), []);
  assert.deepEqual(readMixHistory('{}'), []);
  assert.equal(pickFreshTrending(pool.slice(0, 2), pool.map(song => song.id), 10).length, 2);
});

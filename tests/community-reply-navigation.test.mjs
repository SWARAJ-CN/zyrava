import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/community-reply-navigation.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { loadReplyHistory } = exports;
const row = index => ({ id: String(index), createdAt: new Date(index * 60000).toISOString() });

test('already loaded replies jump without fetching history', async () => {
  let requests = 0;
  assert.deepEqual(await loadReplyHistory('5', [row(5)], async () => { requests++; return []; }, () => true), []);
  assert.equal(requests, 0);
});
test('older reply lookup loads contiguous pages until the target is found', async () => {
  const cursors = [];
  const pages = [[row(3),row(4)], [row(1),row(2)]];
  const rows = await loadReplyHistory('1', [row(5),row(6)], async before => { cursors.push(before); return pages.shift(); }, () => true);
  assert.deepEqual(cursors, [row(5).createdAt,row(3).createdAt]);
  assert.deepEqual(rows.map(item => item.id).sort(), ['1','2','3','4']);
});
test('a canceled jump or changed account/thread never applies a late response', async () => {
  let current = true, requests = 0;
  const result = await loadReplyHistory('1', [row(5)], async () => { requests++; current = false; return [row(1)]; }, () => current);
  assert.equal(result,null);assert.equal(requests,1);
});
test('missing messages and stalled pagination stop instead of looping', async () => {
  await assert.rejects(loadReplyHistory('1',[row(5)],async()=>[],()=>true), /no longer available/);
  let requests=0;
  await assert.rejects(loadReplyHistory('1',[row(5)],async()=>{requests++;return [row(5)]},()=>true), /Couldn't load/);
  assert.equal(requests,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('lib/chat-links.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
const { chatTextParts } = exports;
const links = text => chatTextParts(text).filter(part => part.href);

test('recognizes HTTPS, HTTP, www, bare domains and email while preserving text', () => {
  const text='Listen: https://zyrava.vercel.app/song/123?q=a&b=2\nwww.example.com, example.org/help and hi@example.com. HTTP://example.net';
  assert.equal(chatTextParts(text).map(part=>part.text).join(''),text);
  assert.deepEqual(links(text).map(part=>part.href), ['https://zyrava.vercel.app/song/123?q=a&b=2','https://www.example.com/','https://example.org/help','mailto:hi@example.com','http://example.net/']);
});
test('keeps closing punctuation outside links but preserves balanced URL parentheses',()=>{
  const text='(https://example.com/track_(live)). See https://example.org/a?b=1#part!';
  assert.deepEqual(links(text).map(part=>part.text),['https://example.com/track_(live)','https://example.org/a?b=1#part']);
  assert.equal(chatTextParts(text).map(part=>part.text).join(''),text);
});
test('never creates executable, local-file, credential-disguised, or invalid links',()=>{
  for (const text of ['javascript:alert(1)','javascript:https://example.com','data:text/html,test','file:///example.com','ftp://example.com','https://user:secret@example.com','https://','https://example.com:99999']) assert.equal(links(text).length,0,text);
});
test('literal HTML stays text and repeated renders produce identical results',()=>{
  const text='<script>alert(1)</script> https://example.com';
  assert.equal(chatTextParts(text)[0].text,'<script>alert(1)</script> ');
  assert.deepEqual(chatTextParts(text),chatTextParts(text));
  assert.equal(links('Version 1.2.3, no website here.').length,0);
  assert.equal(chatTextParts('')[0].text,'');
});

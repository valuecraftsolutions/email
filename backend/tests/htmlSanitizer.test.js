import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeEmailHtml,
  sanitizeOutgoingHtml,
} from '../src/services/security/htmlSanitizer.js';

test('removes scripts, event handlers and active content', () => {
  const { html } = sanitizeEmailHtml(`
    <p onclick="steal()" onmouseover="x()">Hi</p>
    <script>alert(1)</script>
    <iframe src="https://evil.example"></iframe>
    <object data="x.swf"></object>
    <form action="https://evil.example"><input name="p"></form>
    <a href="javascript:alert(1)">bad</a>
    <a href="data:text/html,<script>alert(1)</script>">bad2</a>
    <svg><script>alert(1)</script></svg>
    <style>body{display:none}</style>
    <img src="x" onerror="alert(1)">
  `);
  for (const bad of [
    '<script',
    'onclick',
    'onmouseover',
    'onerror',
    '<iframe',
    '<object',
    '<form',
    '<input',
    'javascript:',
    'data:text/html',
    '<svg',
    '<style',
  ])
    assert.ok(!html.toLowerCase().includes(bad), `still contains ${bad}`);
  assert.match(html, /<p>Hi<\/p>/);
});

test('blocks remote images by default and allows them on request', () => {
  const source =
    '<img src="https://tracker.example/pixel.gif" width="1"><img src="cid:logo@x">';
  const blocked = sanitizeEmailHtml(source);
  assert.equal(blocked.blockedImages, 1);
  assert.doesNotMatch(blocked.html, /(?<!-)src="https:\/\/tracker/);
  assert.match(
    blocked.html,
    /data-blocked-src="https:\/\/tracker\.example\/pixel\.gif"/,
  );
  assert.match(blocked.html, /src="cid:logo@x"/);

  const allowed = sanitizeEmailHtml(source, { allowRemoteImages: true });
  assert.equal(allowed.blockedImages, 0);
  assert.match(allowed.html, /src="https:\/\/tracker\.example\/pixel\.gif"/);
});

test('ignores attacker-supplied data-blocked-src attributes', () => {
  const { html } = sanitizeEmailHtml(
    '<img src="cid:a" data-blocked-src="javascript:alert(1)">',
  );
  assert.doesNotMatch(html, /javascript:/);
});

test('links open safely in a new context', () => {
  const { html } = sanitizeEmailHtml(
    '<a href="https://valuecraftminds.com">site</a>',
  );
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test('keeps safe inline styles but strips CSS that loads resources', () => {
  const { html } = sanitizeEmailHtml(
    '<td style="color: #333; background-image: url(https://t.example/a.png); padding: 4px; position: fixed">x</td>',
  );
  assert.match(html, /color:#333/);
  assert.match(html, /padding:4px/);
  assert.doesNotMatch(html, /url\(/);
  assert.doesNotMatch(html, /position/);
});

test('outgoing HTML is sanitized but keeps remote images', () => {
  const html = sanitizeOutgoingHtml(
    '<p>Hi<script>x()</script><img src="https://valuecraftminds.com/logo.png"></p>',
  );
  assert.doesNotMatch(html, /script/);
  assert.match(html, /src="https:\/\/valuecraftminds\.com\/logo\.png"/);
});

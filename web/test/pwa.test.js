/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { build, generateServiceWorker } from '../scripts/build.js';

test('service worker precaches with cache reload', () => {
  const source = generateServiceWorker({
    cacheName: 'solartime-test',
    assets: ['/', '/index.html'],
  });
  assert.match(source, /cache:\s*'reload'/);
  assert.match(source, /skipWaiting/);
  assert.match(source, /clients\.claim/);
});

test('build fingerprints assets and reloads once on a new worker', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'solar-time-'));
  const result = build({ outDir });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const css = readFileSync(join(outDir, 'assets', result.cssName), 'utf8');
  const worker = readFileSync(join(outDir, 'sw.js'), 'utf8');
  const scripts = readdirSync(join(outDir, 'assets')).filter((name) => name.endsWith('.js'));
  const entry = scripts.map((name) => readFileSync(join(outDir, 'assets', name), 'utf8')).join('\n');

  assert.match(html, /width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover/);
  assert.match(html, /name="theme-color" content="#f4f1ea" media="\(prefers-color-scheme: light\)"/);
  assert.match(html, /name="theme-color" content="#121212" media="\(prefers-color-scheme: dark\)"/);
  assert.match(html, new RegExp(`/assets/${result.cssName}`));
  assert.match(html, new RegExp(`/assets/${result.entry}`));
  assert.equal(html.includes('__CSS__'), false);
  assert.equal(html.includes('__JS__'), false);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /\.drawer\s*\{[^}]*right:\s*0/s);
  assert.match(css, /translateX\(100%\)/);
  assert.match(css, /font-size:\s*max\(16px/);
  assert.match(worker, /cache:\s*'reload'/);
  assert.match(entry, /controllerchange/);
  assert.match(entry, /if \(refreshing\) return/);
  assert.match(entry, /window\.location\.reload\(\)/);
  assert.match(entry, /from '\.\/solar-engine\.[0-9a-f]{10}\.js'/);

  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.equal(existsSync(join(outDir, icon.src.slice(1))), true, icon.src);
  }
  for (const asset of result.assets) {
    if (asset === '/') continue;
    assert.equal(existsSync(join(outDir, asset.slice(1))), true, asset);
  }

  for (const name of scripts) {
    const checked = spawnSync(process.execPath, ['--check', join(outDir, 'assets', name)], {
      encoding: 'utf8',
    });
    assert.equal(checked.status, 0, `${name}\n${checked.stderr}`);
  }
});

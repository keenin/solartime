/*
 * Copyright (C) 2026 Keenin Krehbiel
 *
 * THIS FILE WAS WRITTEN ENTIRELY BY ARTIFICIAL INTELLIGENCE (Grok, xAI).
 * No human authored this source code.
 *
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 2 of the License.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(webRoot, 'src');
const publicDir = join(webRoot, 'public');

export function generateServiceWorker({ cacheName, assets }) {
  const list = JSON.stringify(assets, null, 2);
  return `/*
 * Copyright (C) 2026 Keenin Krehbiel
 * THIS FILE WAS WRITTEN ENTIRELY BY ARTIFICIAL INTELLIGENCE (Grok, xAI).
 * SPDX-License-Identifier: GPL-2.0-only
 */
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${list};

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await caches.match('/index.html');
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
`;
}

export function build({ outDir = join(webRoot, 'dist') } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'assets'), { recursive: true });

  const modules = bundleModules(join(srcDir, 'main.js'), outDir);
  const cssSource = readFileSync(join(srcDir, 'styles.css'), 'utf8');
  const cssHash = fingerprint(cssSource);
  const cssName = `styles.${cssHash}.css`;
  writeFileSync(join(outDir, 'assets', cssName), cssSource);

  const html = readFileSync(join(srcDir, 'index.html'), 'utf8')
    .replaceAll('__CSS__', `/assets/${cssName}`)
    .replaceAll('__JS__', `/assets/${modules.entry}`);
  writeFileSync(join(outDir, 'index.html'), html);

  copyPublic(publicDir, outDir);

  const precache = [
    '/',
    '/index.html',
    `/assets/${cssName}`,
    ...modules.urls,
    ...walkFiles(outDir)
      .map((file) => `/${relative(outDir, file).split(sep).join('/')}`)
      .filter((url) => url !== '/index.html' && !url.startsWith('/assets/') && !url.startsWith('/_')),
  ];
  const uniquePrecache = [...new Set(precache)].sort();
  const cacheName = `solartime-${fingerprint(uniquePrecache.join('|'))}`;
  const worker = generateServiceWorker({ cacheName, assets: uniquePrecache });
  writeFileSync(join(outDir, 'sw.js'), worker);

  return { outDir, cacheName, assets: uniquePrecache, entry: modules.entry, cssName };
}

function bundleModules(entryFile, outDir) {
  const order = [];
  const seen = new Set();
  function visit(file) {
    const abs = resolve(file);
    if (seen.has(abs)) return;
    seen.add(abs);
    const source = readFileSync(abs, 'utf8');
    const specs = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
    for (const spec of specs) visit(resolve(dirname(abs), spec));
    order.push(abs);
  }
  visit(entryFile);

  const hashes = new Map();
  const emitted = new Map();
  for (const file of order) {
    let source = readFileSync(file, 'utf8');
    const specs = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
    for (const spec of specs) {
      const dep = resolve(dirname(file), spec);
      const hashed = `./${basename(dep, '.js')}.${hashes.get(dep)}.js`;
      source = source.replaceAll(`'${spec}'`, `'${hashed}'`).replaceAll(`"${spec}"`, `"${hashed}"`);
    }
    const hash = fingerprint(source);
    hashes.set(file, hash);
    emitted.set(file, { hash, source });
  }

  const urls = [];
  for (const [file, output] of emitted) {
    const name = `${basename(file, '.js')}.${output.hash}.js`;
    writeFileSync(join(outDir, 'assets', name), output.source);
    urls.push(`/assets/${name}`);
  }
  const entry = resolve(entryFile);
  return { urls, entry: `${basename(entry, '.js')}.${hashes.get(entry)}.js` };
}

function copyPublic(fromDir, outDir) {
  for (const file of walkFiles(fromDir)) {
    const rel = relative(fromDir, file);
    const target = join(outDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(file));
  }
}

function walkFiles(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) files.push(...walkFiles(file));
    else files.push(file);
  }
  return files;
}

function fingerprint(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const result = build();
  console.log(`built ${result.outDir} (${result.cacheName})`);
}

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

import { isValidLatitude, isValidLongitude } from './location-policy.js';

const SETTINGS_KEY = 'solartime.settings';
const DAY_TOTAL_KEY = 'dayTotal.csv';
const DB_NAME = 'solartime';
const STORE = 'kv';

/** Last accepted GPS fix. Separate from settings so a GPS write does not rewrite them. */
export const LAST_FIX_KEY = 'solartime.lastFix';

/** Minimum gap between localStorage writes of the last GPS fix. */
export const LAST_FIX_PERSIST_MS = 30_000;

export const TEXT_SCALES = [
  { id: 'small', label: 'Small', value: 0.85 },
  { id: 'default', label: 'Default', value: 1 },
  { id: 'large', label: 'Large', value: 1.2 },
  { id: 'xlarge', label: 'Extra large', value: 1.45 },
];

export function normalizeSettings(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const known = TEXT_SCALES.some((scale) => scale.id === raw.textScale);
  return {
    textScale: known ? raw.textScale : 'default',
    mode: raw.mode === 'manual' ? 'manual' : 'device',
    manualLat: typeof raw.manualLat === 'string' ? raw.manualLat : '',
    manualLon: typeof raw.manualLon === 'string' ? raw.manualLon : '',
    showDebug: raw.showDebug === true,
  };
}

export function textScaleValue(id) {
  return TEXT_SCALES.find((scale) => scale.id === id)?.value ?? 1;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Private mode can reject storage. The clock still runs.
  }
}

/**
 * Accept a stored or incoming fix. `lat`/`lon` is the on-disk shape;
 * `latitude`/`longitude` is the in-memory shape.
 */
export function normalizeLastFix(value) {
  if (!value || typeof value !== 'object') return null;
  const latitude = numberOrNull(value.lat ?? value.latitude);
  const longitude = numberOrNull(value.lon ?? value.longitude);
  if (latitude == null || longitude == null) return null;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  const timestamp = numberOrNull(value.timestamp);
  if (timestamp == null || timestamp <= 0) return null;
  let accuracy = value.accuracy ?? value.accuracyM;
  if (accuracy == null || accuracy === '') {
    accuracy = null;
  } else {
    accuracy = numberOrNull(accuracy);
    if (accuracy == null || accuracy < 0) accuracy = null;
  }
  return { latitude, longitude, accuracy, timestamp };
}

export function loadLastFix(storage = browserStorage()) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    return normalizeLastFix(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveLastFix(fix, storage = browserStorage()) {
  if (!storage) return false;
  const normalized = normalizeLastFix(fix);
  if (!normalized) return false;
  try {
    storage.setItem(LAST_FIX_KEY, JSON.stringify({
      lat: normalized.latitude,
      lon: normalized.longitude,
      accuracy: normalized.accuracy,
      timestamp: normalized.timestamp,
    }));
    return true;
  } catch {
    return false;
  }
}

function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function browserStorage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export async function loadDayTotalCsv() {
  try {
    const stored = await idbGet(DAY_TOTAL_KEY);
    if (typeof stored === 'string') return stored;
  } catch {
    // IndexedDB missing or blocked. Fall back below.
  }
  try {
    return localStorage.getItem(`solartime.${DAY_TOTAL_KEY}`) ?? '';
  } catch {
    return '';
  }
}

export async function saveDayTotalCsv(csv) {
  try {
    await idbSet(DAY_TOTAL_KEY, csv);
    return;
  } catch {
    // Fall through to localStorage.
  }
  try {
    localStorage.setItem(`solartime.${DAY_TOTAL_KEY}`, csv);
  } catch {
    // Persistence is best-effort; the in-memory window still updates.
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(value, key);
    });
  } finally {
    db.close();
  }
}

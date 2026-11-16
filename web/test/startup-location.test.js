/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatHms } from '../src/format.js';
import {
  COARSE_POSITION_OPTIONS,
  coarseFixBlocked,
  shouldAcceptFix,
  shouldRequestCoarseFix,
} from '../src/location-policy.js';
import { SolarEngine } from '../src/solar-engine.js';
import { SolarDayTotal } from '../src/solar-day-total.js';
import { chooseBootLocation, emptyLocation, renderView } from '../src/present.js';
import {
  LAST_FIX_KEY,
  LAST_FIX_PERSIST_MS,
  loadLastFix,
  normalizeLastFix,
  saveLastFix,
} from '../src/storage.js';

const engine = new SolarEngine();
const SAVED = { lat: 37.7749, lon: -122.4194, accuracy: 18, timestamp: 1_700_000_000_000 };

test('a saved fix is stored as lat, lon, accuracy, and timestamp', () => {
  const storage = memoryStorage();
  assert.equal(saveLastFix(SAVED, storage), true);
  const raw = JSON.parse(storage.getItem(LAST_FIX_KEY));
  assert.deepEqual(raw, SAVED);
  assert.deepEqual(loadLastFix(storage), {
    latitude: 37.7749,
    longitude: -122.4194,
    accuracy: 18,
    timestamp: 1_700_000_000_000,
  });
});

test('corrupt or impossible saved fixes are ignored and do not clobber a good one', () => {
  const storage = memoryStorage();
  assert.equal(saveLastFix(SAVED, storage), true);
  assert.equal(normalizeLastFix(null), null);
  assert.equal(normalizeLastFix({ lat: 91, lon: 0, accuracy: 5, timestamp: 10 }), null);
  assert.equal(normalizeLastFix({ lat: 10, lon: 20, timestamp: 0 }), null);
  assert.equal(normalizeLastFix({ lat: 10, lon: 20 }), null);
  assert.equal(saveLastFix({ lat: 999, lon: 0, accuracy: 1, timestamp: 11 }, storage), false);
  assert.equal(loadLastFix(storage).latitude, 37.7749);
  storage.setItem(LAST_FIX_KEY, '{');
  assert.equal(loadLastFix(storage), null);
  assert.equal(loadLastFix({ getItem() { throw new Error('blocked'); } }), null);
  const kept = normalizeLastFix({ latitude: 10, longitude: 20, accuracy: -3, timestamp: 10 });
  assert.equal(kept.accuracy, null);
  assert.equal(kept.latitude, 10);
  assert.equal(saveLastFix({ lat: 1, lon: 2, accuracy: null, timestamp: 10 }, storage), true);
  assert.equal(loadLastFix(storage).accuracy, null);
});

test('boot shows the saved fix immediately when no manual location is set', () => {
  const now = Date.UTC(2024, 2, 20, 19, 0, 0);
  const chosen = chooseBootLocation({ manual: null, saved: SAVED });
  assert.equal(chosen.location.stale, true);
  assert.equal(chosen.location.source, 'gps');
  assert.equal(chosen.location.eastSpeedMps, 0);
  assert.equal(chosen.location, chosen.lastGps);
  const data = engine.calculate(chosen.location.latitude, chosen.location.longitude, 0, now);
  const view = renderView({
    now,
    location: chosen.location,
    permission: 'unknown',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'America/Los_Angeles',
  });
  assert.equal(view.solarTimeText, formatHms(data.solarTimeSeconds, true));
  assert.notEqual(view.solarTimeText, '--:--:--.-');
  assert.equal(view.locationText, 'Last known (stale) 37.7749°N  122.4194°W  ±18 m');
  assert.equal(view.locationStatus, 'stale');
  assert.equal(view.showSunArc, true);
  assert.equal(view.showPermissionBanner, false);
  assert.equal(view.trackGps, false);
  assert.equal(view.engineStatusText, 'Engine: 10 Hz · GPS 0.5 Hz');
});

test('manual coordinates win over the saved fix and a fresh fix clears the stale label', () => {
  const manual = {
    latitude: 0,
    longitude: 0,
    eastSpeedMps: 0,
    speedMps: 0,
    accuracyM: null,
    hasFix: true,
    source: 'manual',
  };
  const chosen = chooseBootLocation({ manual, saved: SAVED });
  assert.equal(chosen.location, manual);
  assert.equal(chosen.lastGps.stale, true);
  assert.equal(chosen.lastGps.latitude, 37.7749);
  const manualView = renderView({
    now: Date.UTC(2024, 2, 20, 12, 0, 0),
    location: chosen.location,
    permission: 'granted',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'UTC',
  });
  assert.equal(manualView.locationText, 'Manual 0.0000°N  0.0000°E');
  assert.equal(manualView.locationStatus, 'manual');

  const fresh = renderView({
    now: Date.UTC(2024, 2, 20, 19, 0, 0),
    location: {
      ...chooseBootLocation({ saved: SAVED }).location,
      stale: false,
      coarse: false,
      accuracyM: 5,
    },
    permission: 'granted',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'America/Los_Angeles',
  });
  assert.equal(fresh.locationStatus, 'gps');
  assert.equal(fresh.locationText, '37.7749°N  122.4194°W  ±5 m');
  assert.doesNotMatch(fresh.locationText, /Last known|stale/);
});

test('a denied permission keeps the banner and the last-known clock', () => {
  const chosen = chooseBootLocation({ saved: SAVED });
  const view = renderView({
    now: Date.UTC(2024, 2, 20, 19, 0, 0),
    location: { ...chosen.location, accuracyM: null },
    permission: 'denied',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'UTC',
  });
  assert.equal(view.showPermissionBanner, true);
  assert.equal(view.locationStatus, 'denied');
  assert.equal(view.showManualEntry, true);
  assert.equal(view.locationText, 'Last known (stale) 37.7749°N  122.4194°W');
  assert.notEqual(view.solarTimeText, '--:--:--.-');
  assert.equal(view.showSunArc, false);
});

test('an empty boot still waits, and nothing is saved without a fix', () => {
  const chosen = chooseBootLocation({ manual: null, saved: null });
  assert.equal(chosen.lastGps, null);
  assert.deepEqual(chosen.location, emptyLocation());
  const view = renderView({
    now: Date.UTC(2024, 2, 20, 19, 0, 0),
    location: chosen.location,
    permission: 'prompt',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'UTC',
  });
  assert.equal(view.solarTimeText, '--:--:--.-');
  assert.equal(view.trackGps, true);
});

test('coarse lookup is low accuracy, cached, and cannot raise its own prompt', () => {
  assert.equal(COARSE_POSITION_OPTIONS.enableHighAccuracy, false);
  assert.ok(COARSE_POSITION_OPTIONS.maximumAge >= 10 * 60 * 1000);
  assert.equal(shouldRequestCoarseFix({ permission: 'granted', alreadyRequested: false, manual: false }), true);
  assert.equal(shouldRequestCoarseFix({ permission: 'prompt', alreadyRequested: false, manual: false }), false);
  assert.equal(shouldRequestCoarseFix({ permission: 'unknown', alreadyRequested: false, manual: false }), false);
  assert.equal(shouldRequestCoarseFix({ permission: 'granted', alreadyRequested: true, manual: false }), false);
  assert.equal(shouldRequestCoarseFix({ permission: 'granted', alreadyRequested: false, manual: true }), false);
});

test('a coarse sample does not replace a live high-accuracy fix or arm the throttle', () => {
  assert.equal(coarseFixBlocked({ hasFix: true, source: 'gps', stale: false, coarse: false }), true);
  assert.equal(coarseFixBlocked({ hasFix: true, source: 'gps', stale: true, coarse: false }), false);
  assert.equal(coarseFixBlocked({ hasFix: true, source: 'gps', stale: false, coarse: true }), false);
  assert.equal(coarseFixBlocked({ hasFix: true, source: 'manual', stale: false, coarse: false }), false);
  assert.equal(coarseFixBlocked(emptyLocation()), false);
  assert.equal(shouldAcceptFix(0, 5_000, 2_000), true);
  assert.equal(shouldAcceptFix(0, 1_000, LAST_FIX_PERSIST_MS), true);
  assert.equal(shouldAcceptFix(1_000, 1_000 + LAST_FIX_PERSIST_MS - 1, LAST_FIX_PERSIST_MS), false);
  assert.equal(shouldAcceptFix(1_000, 1_000 + LAST_FIX_PERSIST_MS, LAST_FIX_PERSIST_MS), true);
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

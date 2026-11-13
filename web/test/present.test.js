/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SolarEngine } from '../src/solar-engine.js';
import { SolarDayTotal } from '../src/solar-day-total.js';
import { formatHms, formatLocalHm } from '../src/format.js';
import { eastSpeedFromFix, parseCoordinate, shouldAcceptFix } from '../src/location-policy.js';
import { emptyLocation, renderView } from '../src/present.js';
import { normalizeSettings, textScaleValue } from '../src/storage.js';

const engine = new SolarEngine();

test('apparent solar time shows tenths and the civil offset', () => {
  const now = Date.UTC(2024, 2, 20, 12, 0, 0, 0);
  const dayTotal = new SolarDayTotal();
  const view = renderView({
    now,
    location: fix(0, 0),
    permission: 'granted',
    dayTotal,
    engine,
    timeZone: 'UTC',
  });
  const data = engine.calculate(0, 0, 0, now);
  assert.equal(view.regularTimeText, '12:00:00.0');
  assert.equal(view.solarTimeText, formatHms(data.solarTimeSeconds, true));
  assert.match(view.solarTimeText, /^\d\d:\d\d:\d\d\.\d$/);
  assert.equal(view.solarTimeText, '11:52:08.5');
  assert.equal(view.eotText, 'Equation of time -7.9 min');
  assert.equal(view.solarVelocityText, 'Solar velocity 1.00021x');
  assert.equal(view.runningTotalText, '24h +0 min 00 sec');
  assert.match(view.civilOffsetText, /^Civil time is .+ ahead of the sun$/);
  assert.equal(
    view.sunTimesText,
    `Rise ${formatLocalHm(data.sunriseUtcMillis, 'UTC')}    Noon ${formatLocalHm(data.solarNoonUtcMillis, 'UTC')}    Set ${formatLocalHm(data.sunsetUtcMillis, 'UTC')}`,
  );
});

test('one degree west lengthens the 24 hour total by four minutes', () => {
  const dayTotal = new SolarDayTotal(SolarDayTotal.WINDOW_MILLIS, 1000);
  const start = Date.UTC(2024, 2, 20, 12, 0, 0, 0);
  renderView({
    now: start,
    location: fix(0, 0),
    permission: 'granted',
    dayTotal,
    engine,
    timeZone: 'UTC',
  });
  const later = renderView({
    now: start + 1000,
    location: fix(0, -1),
    permission: 'granted',
    dayTotal,
    engine,
    timeZone: 'UTC',
  });
  assert.equal(later.runningTotalText, '24h +4 min 00 sec');
  assert.equal(later.locationText, 'Manual 0.0000°N  1.0000°W');
});

test('los angeles civil clock follows the time zone', () => {
  const now = Date.UTC(2024, 2, 20, 12, 0, 0, 150);
  const view = renderView({
    now,
    location: emptyLocation(),
    permission: 'prompt',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'America/Los_Angeles',
  });
  assert.equal(view.regularTimeText, '05:00:00.1');
  assert.equal(view.solarTimeText, '--:--:--.-');
  assert.equal(view.showPermissionBanner, true);
  assert.equal(view.trackGps, true);
});

test('polar zone warns and drops the eastward rate', () => {
  const now = Date.UTC(2024, 5, 21, 12, 0, 0, 0);
  const view = renderView({
    now,
    location: {
      latitude: 89.9,
      longitude: 0,
      eastSpeedMps: 30,
      speedMps: 30,
      accuracyM: 8,
      hasFix: true,
      source: 'gps',
    },
    permission: 'granted',
    dayTotal: new SolarDayTotal(),
    engine,
    timeZone: 'UTC',
  });
  assert.equal(view.polar, true);
  assert.equal(view.locationText, '89.9000°N  0.0000°E  ±8 m');
  assert.equal(view.gpsIntervalMillis, 200);
  assert.match(view.sunTimesText, /^Sun up all day/);
});

test('east speed uses heading and missing values stay zero', () => {
  assert.ok(Math.abs(eastSpeedFromFix(10, 90) - 10) < 1e-12);
  assert.ok(Math.abs(eastSpeedFromFix(10, 270) - -10) < 1e-12);
  assert.equal(eastSpeedFromFix(10, 0), 0);
  assert.equal(eastSpeedFromFix(null, 90), 0);
  assert.equal(eastSpeedFromFix(10, null), 0);
});

test('fix throttle and manual coordinates', () => {
  assert.equal(shouldAcceptFix(0, 1000, 2000), true);
  assert.equal(shouldAcceptFix(1000, 1500, 2000), false);
  assert.equal(shouldAcceptFix(1000, 3000, 2000), true);
  assert.equal(parseCoordinate(' 37.7749 '), 37.7749);
  assert.equal(parseCoordinate('-122.4194'), -122.4194);
  assert.equal(parseCoordinate('12abc'), null);
  assert.equal(parseCoordinate(''), null);
});

test('settings normalize text size and manual mode', () => {
  assert.deepEqual(normalizeSettings(null), {
    textScale: 'default',
    mode: 'device',
    manualLat: '',
    manualLon: '',
    showDebug: false,
  });
  assert.equal(normalizeSettings({ textScale: 'xlarge', mode: 'manual', showDebug: true }).textScale, 'xlarge');
  assert.equal(normalizeSettings({ textScale: 'huge' }).textScale, 'default');
  assert.equal(textScaleValue('large'), 1.2);
});

function fix(latitude, longitude) {
  return {
    latitude,
    longitude,
    eastSpeedMps: 0,
    speedMps: 0,
    accuracyM: null,
    hasFix: true,
    source: 'manual',
  };
}

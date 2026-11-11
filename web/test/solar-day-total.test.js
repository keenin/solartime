/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SECONDS_PER_DEGREE } from '../src/solar-engine.js';
import { SolarDayTotal } from '../src/solar-day-total.js';
import { formatSignedMinSec, formatUnsignedMinSec } from '../src/format.js';
import { UI_PERIOD_MS } from '../src/present.js';

test('total is zero with no samples', () => {
  const window = new SolarDayTotal();
  assert.equal(window.totalSeconds(1000, 0), 0);
  assert.equal(window.sampleCount, 0);
});

test('total is zero when stationary', () => {
  const window = new SolarDayTotal();
  const offset = 15 * SECONDS_PER_DEGREE;
  window.record(0, offset);
  window.record(60_000, offset);
  assert.ok(Math.abs(window.totalSeconds(60_000, offset)) <= 1e-9);
});

test('total westbound lengthens and eastbound shortens', () => {
  const west = new SolarDayTotal();
  const westOneDegree = -SECONDS_PER_DEGREE;
  west.record(0, 0);
  west.record(3_600_000, westOneDegree);
  assert.ok(Math.abs(west.totalSeconds(3_600_000, westOneDegree) - 240) <= 1e-9);

  const east = new SolarDayTotal();
  const eastOneDegree = SECONDS_PER_DEGREE;
  east.record(0, 0);
  east.record(3_600_000, eastOneDegree);
  assert.ok(Math.abs(east.totalSeconds(3_600_000, eastOneDegree) - -240) <= 1e-9);
});

test('total drops samples older than window', () => {
  const window = new SolarDayTotal(60_000, 1000);
  window.record(0, 0);
  window.record(1000, 100);
  window.record(61_000, 250);
  assert.ok(Math.abs(window.totalSeconds(61_000, 250) - -150) <= 1e-9);
  assert.ok(window.sampleCount <= 2);
});

test('total keeps oldest sample before cutoff for baseline', () => {
  const window = new SolarDayTotal(60_000, 1000);
  window.record(0, 0);
  window.record(90_000, 80);
  assert.ok(Math.abs(window.totalSeconds(90_000, 80) - -80) <= 1e-9);
  assert.equal(window.sampleCount, 2);
});

test('total rate limits sub interval samples', () => {
  const window = new SolarDayTotal(SolarDayTotal.WINDOW_MILLIS, 1000);
  window.record(0, 0);
  window.record(100, 50);
  window.record(999, 90);
  window.record(1000, 40);
  assert.equal(window.sampleCount, 2);
  assert.ok(Math.abs(window.totalSeconds(1000, 40) - -40) <= 1e-9);
});

test('total ignores backwards timestamps', () => {
  const window = new SolarDayTotal();
  window.record(5000, 10);
  window.record(4000, 999);
  assert.equal(window.sampleCount, 1);
  assert.ok(Math.abs(window.totalSeconds(5000, 15) - -5) <= 1e-9);
});

test('total wraps antimeridian eastward as small negative', () => {
  const window = new SolarDayTotal();
  const start = 179 * SECONDS_PER_DEGREE;
  const end = -179 * SECONDS_PER_DEGREE;
  window.record(0, start);
  window.record(3_600_000, end);
  assert.ok(Math.abs(window.totalSeconds(3_600_000, end) - -480) <= 1e-9);
});

test('total tracks live offset at solar velocity ui rate', () => {
  const window = new SolarDayTotal(SolarDayTotal.WINDOW_MILLIS, 1000);
  for (let i = 0; i <= 30; i += 1) {
    const t = i * UI_PERIOD_MS;
    const offset = (t / 1000) * SECONDS_PER_DEGREE;
    window.record(t, offset);
    assert.ok(Math.abs(window.totalSeconds(t, offset) - -offset) <= 1e-9);
  }
  assert.equal(window.sampleCount, 4);
});

test('total uses live offset even without new sample', () => {
  const window = new SolarDayTotal(SolarDayTotal.WINDOW_MILLIS, 1000);
  window.record(0, 0);
  assert.ok(Math.abs(window.totalSeconds(400, 120) - -120) <= 1e-9);
});

test('round trip preserves samples', () => {
  const window = new SolarDayTotal();
  window.record(1000, 12.5);
  window.record(2000, -240);
  window.record(3000, 480.25);
  const restored = new SolarDayTotal();
  restored.readFrom(window.toCsv());
  assert.deepEqual(restored.snapshot(), window.snapshot());
  assert.ok(Math.abs(window.totalSeconds(3000, 480.25) - restored.totalSeconds(3000, 480.25)) <= 1e-6);
});

test('readFrom ignores unknown version and bad lines', () => {
  const window = new SolarDayTotal();
  window.record(5, 5);
  window.readFrom('v0\n1000,1.0\n');
  assert.equal(window.sampleCount, 0);

  const mixed = 'v1\nbad\n2000,not-a-number\n3000,15.0\n2000,1.0\n';
  window.readFrom(mixed);
  assert.equal(window.sampleCount, 1);
  assert.equal(window.snapshot()[0].timeMillis, 3000);
  assert.equal(window.snapshot()[0].longitudeOffsetSeconds, 15);
});

test('formatSignedMinSec matches requested style', () => {
  assert.equal(formatSignedMinSec(12 * 60 + 34), '+12 min 34 sec');
  assert.equal(formatSignedMinSec(-(7 * 60 + 12)), '-7 min 12 sec');
  assert.equal(formatSignedMinSec(0), '+0 min 00 sec');
  assert.equal(formatSignedMinSec(0.4), '+0 min 00 sec');
  assert.equal(formatSignedMinSec(-0.5), '-0 min 01 sec');
  assert.equal(formatSignedMinSec(3600 + 2 * 60 + 3), '+1 h 2 min 03 sec');
  assert.equal(formatSignedMinSec(-3 * 3600), '-3 h 0 min 00 sec');
});

test('formatUnsignedMinSec includes seconds', () => {
  assert.equal(formatUnsignedMinSec(17 * 60 + 12), '17 min 12 sec');
  assert.equal(formatUnsignedMinSec(7 * 60), '7 min 00 sec');
  assert.equal(formatUnsignedMinSec(12), '12 sec');
  assert.equal(formatUnsignedMinSec(0.6), '1 sec');
  assert.equal(formatUnsignedMinSec(0.4), '0 sec');
  assert.equal(formatUnsignedMinSec(3600 + 2 * 60 + 3), '1 h 2 min 03 sec');
});

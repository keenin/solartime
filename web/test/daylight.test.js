/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  daylightDarknessText,
  formatDaylightChange,
  formatSolarDayLength,
} from '../src/format.js';
import {
  SECONDS_PER_DAY,
  SolarEngine,
  daylightDarknessSeconds,
} from '../src/solar-engine.js';

const engine = new SolarEngine(() => {
  throw new Error('clock should be passed explicitly in tests');
});

test('daylight is sunset minus sunrise and darkness is the rest of the day', () => {
  const data = engine.calculate(47.6, -122.3, 0, Date.UTC(2026, 10, 17, 20, 0, 0));
  assert.notEqual(data.sunriseSolarSeconds, null);
  assert.notEqual(data.sunsetSolarSeconds, null);
  let daylight = data.sunsetSolarSeconds - data.sunriseSolarSeconds;
  if (daylight < 0) daylight += SECONDS_PER_DAY;
  assert.equal(data.daylightSeconds, daylight);
  assert.equal(data.darknessSeconds, SECONDS_PER_DAY - daylight);
  assert.ok(data.daylightSeconds > 8 * 3600 && data.daylightSeconds < 11 * 3600);
  assert.match(daylightDarknessText(data), /^Daylight \d+h \d{2}m · Darkness \d+h \d{2}m$/);
});

test('equator near equinox is a little longer than twelve hours', () => {
  const data = engine.calculate(0, 0, 0, Date.UTC(2024, 2, 20, 12, 0, 0));
  assert.equal(data.isPolarDay, false);
  assert.equal(data.isPolarNight, false);
  assert.ok(data.daylightSeconds > 12 * 3600);
  assert.ok(data.daylightSeconds < 12.5 * 3600);
  assert.equal(data.daylightSeconds + data.darknessSeconds, SECONDS_PER_DAY);
  assert.equal(daylightDarknessText(data), 'Daylight 12h 07m · Darkness 11h 53m');
});

test('high latitude winter is short and summer is long', () => {
  const winter = engine.calculate(60, 0, 0, Date.UTC(2024, 11, 21, 12, 0, 0));
  const summer = engine.calculate(60, 0, 0, Date.UTC(2024, 5, 21, 12, 0, 0));
  assert.ok(winter.daylightSeconds < 7 * 3600);
  assert.ok(summer.daylightSeconds > 17 * 3600);
  assert.equal(winter.daylightSeconds + winter.darknessSeconds, SECONDS_PER_DAY);
  assert.equal(summer.daylightSeconds + summer.darknessSeconds, SECONDS_PER_DAY);
  assert.match(daylightDarknessText(winter), /^Daylight \d+h \d{2}m · Darkness \d+h \d{2}m$/);
  assert.match(daylightDarknessText(summer), /^Daylight \d+h \d{2}m · Darkness \d+h \d{2}m$/);
});

test('polar day and polar night take the whole day', () => {
  const june = engine.calculate(90, 0, 0, Date.UTC(2024, 5, 21, 12, 0, 0));
  assert.equal(june.isPolarDay, true);
  assert.equal(june.daylightSeconds, SECONDS_PER_DAY);
  assert.equal(june.darknessSeconds, 0);
  assert.equal(daylightDarknessText(june), 'Daylight 24h · Darkness 0h');

  const december = engine.calculate(90, 0, 0, Date.UTC(2024, 11, 21, 12, 0, 0));
  assert.equal(december.isPolarNight, true);
  assert.equal(december.daylightSeconds, 0);
  assert.equal(december.darknessSeconds, SECONDS_PER_DAY);
  assert.equal(daylightDarknessText(december), 'Daylight 0h · Darkness 24h');

  const southJune = engine.calculate(-90, 0, 0, Date.UTC(2024, 5, 21, 12, 0, 0));
  assert.equal(southJune.isPolarNight, true);
  assert.equal(daylightDarknessText(southJune), 'Daylight 0h · Darkness 24h');

  const southDecember = engine.calculate(-90, 0, 0, Date.UTC(2024, 11, 21, 12, 0, 0));
  assert.equal(southDecember.isPolarDay, true);
  assert.equal(daylightDarknessText(southDecember), 'Daylight 24h · Darkness 0h');
});

test('wrapped sunrise past midnight still yields a positive daylight', () => {
  const wrapped = daylightDarknessSeconds({
    sunriseSolarSeconds: 86_000,
    sunsetSolarSeconds: 400,
    polarDay: false,
    polarNight: false,
  });
  assert.equal(wrapped.daylightSeconds, 800);
  assert.equal(wrapped.darknessSeconds, SECONDS_PER_DAY - 800);

  const allDay = daylightDarknessSeconds({
    sunriseSolarSeconds: 0,
    sunsetSolarSeconds: 0,
    polarDay: false,
    polarNight: false,
  });
  assert.equal(allDay.daylightSeconds, SECONDS_PER_DAY);
  assert.equal(allDay.darknessSeconds, 0);

  const touchesNoon = daylightDarknessSeconds({
    sunriseSolarSeconds: 43_200,
    sunsetSolarSeconds: 43_200,
    polarDay: false,
    polarNight: false,
  });
  assert.equal(touchesNoon.daylightSeconds, 0);
  assert.equal(touchesNoon.darknessSeconds, SECONDS_PER_DAY);
});

test('missing sunrise without a polar flag stays empty', () => {
  const missing = daylightDarknessSeconds({
    sunriseSolarSeconds: null,
    sunsetSolarSeconds: null,
    polarDay: false,
    polarNight: false,
  });
  assert.equal(missing.daylightSeconds, null);
  assert.equal(daylightDarknessText(missing), '');
});

test('daylight text rounds to the nearest minute and still sums to 24h', () => {
  const low = daylightDarknessText({
    isPolarDay: false,
    isPolarNight: false,
    daylightSeconds: 9 * 3600 + 52 * 60 + 29,
  });
  assert.equal(low, 'Daylight 9h 52m · Darkness 14h 08m');

  const high = daylightDarknessText({
    isPolarDay: false,
    isPolarNight: false,
    daylightSeconds: 9 * 3600 + 52 * 60 + 30,
  });
  assert.equal(high, 'Daylight 9h 53m · Darkness 14h 07m');
});

test('daylight change versus yesterday uses a compact signed duration', () => {
  assert.equal(formatDaylightChange(-(2 * 60 + 10)), '−2m 10s vs yesterday');
  assert.equal(formatDaylightChange(2 * 60 + 10), '+2m 10s vs yesterday');
  assert.equal(formatDaylightChange(-(3600 + 2 * 60 + 3)), '−1h 2m 03s vs yesterday');
  assert.equal(formatDaylightChange(-8), '−8s vs yesterday');
  assert.equal(formatDaylightChange(0), '');
  assert.equal(formatDaylightChange(0.4), '');
  assert.equal(formatDaylightChange(-0.5), '−1s vs yesterday');
});

test('northern autumn daylight is shorter than the day before', () => {
  const now = Date.UTC(2026, 10, 17, 20, 0, 0);
  const today = engine.calculate(47.6, -122.3, 0, now);
  const yesterday = engine.calculate(47.6, -122.3, 0, now - SECONDS_PER_DAY * 1000);
  const delta = today.daylightSeconds - yesterday.daylightSeconds;
  assert.ok(delta < -60);
  assert.match(formatDaylightChange(delta), /^−\d+m \d{2}s vs yesterday$/);
});

test('solar day length is 24h plus the movement offset', () => {
  assert.equal(formatSolarDayLength(0), 'Solar day 24h 00m 00s');
  assert.equal(formatSolarDayLength(3 * 60 + 15), 'Solar day 24h 03m 15s');
  assert.equal(formatSolarDayLength(-(3 * 60 + 15)), 'Solar day 23h 56m 45s');
  assert.equal(formatSolarDayLength(4 * 60), 'Solar day 24h 04m 00s');
  assert.equal(formatSolarDayLength(3600), 'Solar day 25h 00m 00s');
  assert.equal(formatSolarDayLength(0.4), 'Solar day 24h 00m 00s');
  assert.equal(formatSolarDayLength(0.5), 'Solar day 24h 00m 01s');
  assert.equal(formatSolarDayLength(-0.6), 'Solar day 23h 59m 59s');
});

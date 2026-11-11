/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { SolarEngine, wrapSeconds, wrapSignedSeconds } from '../src/solar-engine.js';
import { gpsIntervalMillis } from '../src/location-policy.js';

const engine = new SolarEngine(() => {
  throw new Error('clock should be passed explicitly in tests');
});

const fixture = JSON.parse(readFileSync(new URL('./fixtures/kotlin-solar.json', import.meta.url), 'utf8'));

test('kotlin fixture uses the same UTC instants as Date.UTC', () => {
  for (const item of fixture.cases) {
    const millis = Date.UTC(
      item.year,
      item.month - 1,
      item.day,
      item.hour,
      item.minute,
      item.second,
      item.millisecond,
    );
    assert.equal(millis, item.utcMillis, item.name);
  }
});

test('web engine matches SolarEngine.kt for several dates and locations', () => {
  for (const item of fixture.cases) {
    const data = engine.calculate(item.latitude, item.longitude, item.eastSpeedMps, item.utcMillis);
    close(data.solarTimeSeconds, item.solarTimeSeconds, 1e-6, `${item.name} solarTimeSeconds`);
    close(data.eotSeconds, item.eotSeconds, 1e-6, `${item.name} eotSeconds`);
    close(data.eotRate, item.eotRate, 1e-12, `${item.name} eotRate`);
    close(data.longitudeOffsetSeconds, item.longitudeOffsetSeconds, 1e-9, `${item.name} longitudeOffsetSeconds`);
    close(data.solarVelocity, item.solarVelocity, 1e-12, `${item.name} solarVelocity`);
    close(data.sunAltitudeDeg, item.sunAltitudeDeg, 1e-6, `${item.name} sunAltitudeDeg`);
    close(data.sunriseSolarSeconds, item.sunriseSolarSeconds, 1e-6, `${item.name} sunriseSolarSeconds`);
    close(data.sunsetSolarSeconds, item.sunsetSolarSeconds, 1e-6, `${item.name} sunsetSolarSeconds`);
    assert.equal(data.solarNoonUtcMillis, item.solarNoonUtcMillis, `${item.name} solarNoonUtcMillis`);
    assert.equal(data.sunriseUtcMillis, item.sunriseUtcMillis, `${item.name} sunriseUtcMillis`);
    assert.equal(data.sunsetUtcMillis, item.sunsetUtcMillis, `${item.name} sunsetUtcMillis`);
    assert.equal(data.isPolarDay, item.isPolarDay, `${item.name} isPolarDay`);
    assert.equal(data.isPolarNight, item.isPolarNight, `${item.name} isPolarNight`);
    assert.equal(data.isPolarDampened, item.isPolarDampened, `${item.name} isPolarDampened`);
  }
});

test('calculate returns solar time in range', () => {
  const data = engine.calculate(0, 0, 0, utcMillis(2024, 3, 20, 12));
  assert.ok(data.solarTimeSeconds >= 0 && data.solarTimeSeconds <= 86400);
  assert.ok(data.eotSeconds >= -20 * 60 && data.eotSeconds <= 20 * 60);
});

test('calculate with longitude offset', () => {
  const t = utcMillis(2024, 3, 20, 12);
  const dataRef = engine.calculate(0, 0, 0, t);
  const dataEast = engine.calculate(0, 15, 0, t);
  let diff = dataEast.solarTimeSeconds - dataRef.solarTimeSeconds;
  if (diff < -43200) diff += 86400;
  if (diff > 43200) diff -= 86400;
  assert.ok(Math.abs(diff - 3600) <= 1);
  assert.ok(Math.abs(dataEast.longitudeOffsetSeconds - 3600) <= 0.001);
});

test('calculate uses injected clock', () => {
  const t = utcMillis(2024, 6, 21, 0);
  const data = new SolarEngine(() => t).calculate(0, 0);
  assert.equal(data.utcMillis, t);
});

test('calculate rest velocity is near one', () => {
  const data = engine.calculate(0, 0, 0, utcMillis(2024, 3, 20, 12));
  assert.ok(Math.abs(data.solarVelocity - 1) <= 0.002);
  assert.ok(Math.abs(data.eotRate - (data.solarVelocity - 1)) <= 1e-9);
});

test('calculate east west travel changes velocity', () => {
  const t = utcMillis(2024, 3, 20, 12);
  const rest = engine.calculate(0, 0, 0, t);
  const east = engine.calculate(0, 0, 46.51, t);
  const west = engine.calculate(0, 0, -46.51, t);
  assert.ok(Math.abs(east.solarVelocity - rest.solarVelocity - 0.1) <= 0.002);
  assert.ok(Math.abs(west.solarVelocity - rest.solarVelocity - -0.1) <= 0.002);
});

test('calculate equator equinox has sunrise near six', () => {
  const data = engine.calculate(0, 0, 0, utcMillis(2024, 3, 20, 12));
  assert.notEqual(data.sunriseSolarSeconds, null);
  assert.notEqual(data.sunsetSolarSeconds, null);
  assert.ok(Math.abs(data.sunriseSolarSeconds - 6 * 3600) <= 20 * 60);
  assert.ok(Math.abs(data.sunsetSolarSeconds - 18 * 3600) <= 20 * 60);
  assert.ok(data.sunAltitudeDeg > 50);
});

test('calculate north pole solstices are polar day and night', () => {
  const june = engine.calculate(90, 0, 0, utcMillis(2024, 6, 21, 12));
  assert.equal(june.isPolarDay, true);
  assert.equal(june.sunriseSolarSeconds, null);
  assert.equal(june.sunsetSolarSeconds, null);
  assert.equal(june.isPolarDampened, true);

  const december = engine.calculate(90, 0, 0, utcMillis(2024, 12, 21, 12));
  assert.equal(december.isPolarNight, true);
  assert.equal(december.sunriseSolarSeconds, null);
  assert.equal(december.isPolarDampened, true);
});

test('calculate polar dampens relative velocity', () => {
  const t = utcMillis(2024, 6, 21, 12);
  const rest = engine.calculate(89.9, 0, 0, t);
  const moving = engine.calculate(89.9, 0, 30, t);
  assert.ok(Math.abs(rest.solarVelocity - moving.solarVelocity) <= 1e-9);
});

test('latitude 85 keeps east-west rate and 85.1 dampens it', () => {
  const t = utcMillis(2024, 9, 22, 6, 30, 0, 0);
  const edge = engine.calculate(85, 179.9, 5, t);
  const past = engine.calculate(85.1, 179.9, 5, t);
  assert.equal(edge.isPolarDampened, false);
  assert.equal(past.isPolarDampened, true);
  assert.ok(edge.solarVelocity - past.solarVelocity > 0.1);
});

test('wrapSeconds handles negatives and overflow', () => {
  assert.equal(wrapSeconds(86400), 0);
  assert.ok(Math.abs(wrapSeconds(-86399) - 1) <= 1e-9);
  assert.ok(Math.abs(wrapSeconds(86500) - 100) <= 1e-9);
});

test('wrapSignedSeconds stays in plus minus half day', () => {
  assert.ok(Math.abs(wrapSignedSeconds(3600) - 3600) <= 1e-9);
  assert.ok(Math.abs(wrapSignedSeconds(-3600) - -3600) <= 1e-9);
  assert.ok(Math.abs(wrapSignedSeconds(50000)) <= 43200);
});

test('gps interval matches speed buckets', () => {
  assert.equal(gpsIntervalMillis(0), 2000);
  assert.equal(gpsIntervalMillis(5), 500);
  assert.equal(gpsIntervalMillis(20), 200);
  assert.equal(gpsIntervalMillis(40), 100);
});

function close(actual, expected, tolerance, label) {
  if (expected === null || actual === null) {
    assert.equal(actual, expected, label);
    return;
  }
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tolerance, `${label}: ${actual} vs ${expected} (diff ${diff})`);
}

function utcMillis(year, month, day, hour, minute = 0, second = 0, millis = 0) {
  return Date.UTC(year, month - 1, day, hour, minute, second, millis);
}

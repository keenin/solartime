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

/** Same speed buckets as SolarViewModel.gpsIntervalMillis. */
export function gpsIntervalMillis(speedMps) {
  if (speedMps < 1) return 2000;
  if (speedMps < 15) return 500;
  if (speedMps < 40) return 200;
  return 100;
}

/**
 * Eastward metres per second. Heading is degrees clockwise from north,
 * matching Android's bearing. Missing speed or heading contributes nothing.
 */
export function eastSpeedFromFix(speedMps, headingDeg) {
  if (!Number.isFinite(speedMps) || !Number.isFinite(headingDeg)) return 0;
  return speedMps * Math.sin((headingDeg * Math.PI) / 180);
}

/** Drop fixes that arrive sooner than the active refresh interval. */
export function shouldAcceptFix(lastAcceptedMs, nowMs, intervalMs) {
  if (!lastAcceptedMs) return true;
  return nowMs - lastAcceptedMs >= intervalMs;
}

const LATITUDE_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const LONGITUDE_RE = LATITUDE_RE;

export function parseCoordinate(text) {
  const trimmed = String(text ?? '').trim();
  if (!LATITUDE_RE.test(trimmed) && !LONGITUDE_RE.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function isValidLatitude(latitude) {
  return latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(longitude) {
  return longitude >= -180 && longitude <= 180;
}

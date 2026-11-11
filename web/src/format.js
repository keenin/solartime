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

import { wrapSeconds } from './solar-engine.js';

/** Java Formatter half-up (half away from zero), Locale.US, no grouping. */
export function formatFixed(value, digits, { signed = false } = {}) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
    roundingMode: 'halfExpand',
    signDisplay: signed ? 'always' : 'auto',
  }).format(value);
}

function roundAwayFromZero(seconds) {
  const absRounded = Math.floor(Math.abs(seconds) + 0.5);
  return seconds < 0 ? -absRounded : absRounded;
}

function absHms(rounded) {
  const remaining = Math.abs(rounded);
  return {
    hours: Math.floor(remaining / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    secs: remaining % 60,
  };
}

export function formatSignedMinSec(seconds) {
  const rounded = roundAwayFromZero(seconds);
  const { hours, minutes, secs } = absHms(rounded);
  const sign = rounded < 0 ? '-' : '+';
  const secText = String(secs).padStart(2, '0');
  if (hours > 0) return `${sign}${hours} h ${minutes} min ${secText} sec`;
  return `${sign}${minutes} min ${secText} sec`;
}

export function formatUnsignedMinSec(seconds) {
  const { hours, minutes, secs } = absHms(roundAwayFromZero(seconds));
  const secText = String(secs).padStart(2, '0');
  if (hours > 0) return `${hours} h ${minutes} min ${secText} sec`;
  if (minutes > 0) return `${minutes} min ${secText} sec`;
  return `${secs} sec`;
}

export function formatHms(seconds, tenths) {
  const wrapped = wrapSeconds(seconds);
  const totalTenths = clampInt(Math.trunc(wrapped * 10), 0, 863_999);
  const h = Math.floor(totalTenths / 36_000);
  const m = Math.floor(totalTenths / 600) % 60;
  const s = Math.floor(totalTenths / 10) % 60;
  const t = totalTenths % 10;
  const clock = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return tenths ? `${clock}.${t}` : clock;
}

export function civilOffsetMessage(diffSeconds) {
  if (Math.abs(diffSeconds) < 0.5) return 'Civil time matches the sun';
  const amount = formatUnsignedMinSec(Math.abs(diffSeconds));
  if (diffSeconds > 0) return `Civil time is ${amount} ahead of the sun`;
  return `Civil time is ${amount} behind the sun`;
}

export function formatLatitude(latitude) {
  const hemisphere = latitude >= 0 ? 'N' : 'S';
  return `${formatFixed(Math.abs(latitude), 4)}°${hemisphere}`;
}

export function formatLongitude(longitude) {
  const hemisphere = longitude >= 0 ? 'E' : 'W';
  return `${formatFixed(Math.abs(longitude), 4)}°${hemisphere}`;
}

export function formatCoordinatePair(latitude, longitude) {
  return `${formatLatitude(latitude)}  ${formatLongitude(longitude)}`;
}

export function civilClock(utcMillis, timeZone) {
  const date = new Date(utcMillis);
  const parts = zonedParts(date, timeZone);
  const ms = date.getUTCMilliseconds();
  const text = `${parts.hour}:${parts.minute}:${parts.second}.${Math.floor(ms / 100)}`;
  const localSeconds = Number(parts.hour) * 3600 +
    Number(parts.minute) * 60 +
    Number(parts.second) +
    ms / 1000;
  return { text, localSeconds };
}

export function formatLocalHm(utcMillis, timeZone) {
  const parts = zonedParts(new Date(utcMillis), timeZone);
  return `${parts.hour}:${parts.minute}`;
}

export function sunTimesText(data, timeZone) {
  const noon = formatLocalHm(data.solarNoonUtcMillis, timeZone);
  if (data.isPolarDay) return `Sun up all day · Noon ${noon}`;
  if (data.isPolarNight) return 'Sun down all day';
  if (data.sunriseUtcMillis != null && data.sunsetUtcMillis != null) {
    const rise = formatLocalHm(data.sunriseUtcMillis, timeZone);
    const set = formatLocalHm(data.sunsetUtcMillis, timeZone);
    return `Rise ${rise}    Noon ${noon}    Set ${set}`;
  }
  return `Noon ${noon}`;
}

function zonedParts(date, timeZone) {
  const options = {
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  };
  if (timeZone) options.timeZone = timeZone;
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  let hour = map.hour === '24' ? '00' : map.hour;
  hour = pad2(Number(hour));
  return {
    hour,
    minute: pad2(Number(map.minute)),
    second: pad2(Number(map.second)),
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

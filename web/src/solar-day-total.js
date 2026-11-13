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

/**
 * Port of SolarDayTotal.kt. Positive totals lengthen the solar day
 * (westbound); negative totals shorten it.
 */

import { wrapSignedSeconds } from './solar-engine.js';

const FILE_VERSION = 'v1';

export class SolarDayTotal {
  static WINDOW_MILLIS = 24 * 60 * 60 * 1000;
  static SAMPLE_INTERVAL_MILLIS = 1000;

  constructor(
    windowMillis = SolarDayTotal.WINDOW_MILLIS,
    minSampleIntervalMillis = SolarDayTotal.SAMPLE_INTERVAL_MILLIS,
  ) {
    this.windowMillis = windowMillis;
    this.minSampleIntervalMillis = minSampleIntervalMillis;
    this.samples = [];
  }

  get sampleCount() {
    return this.samples.length;
  }

  record(timeMillis, longitudeOffsetSeconds) {
    const last = this.samples[this.samples.length - 1];
    if (last) {
      if (timeMillis < last.timeMillis) return;
      if (timeMillis - last.timeMillis < this.minSampleIntervalMillis) return;
    }
    this.samples.push({ timeMillis, longitudeOffsetSeconds });
    this.evict(timeMillis);
  }

  totalSeconds(timeMillis, currentLongitudeOffsetSeconds) {
    this.evict(timeMillis);
    const start = this.samples[0];
    if (!start) return 0;
    return wrapSignedSeconds(start.longitudeOffsetSeconds - currentLongitudeOffsetSeconds);
  }

  snapshot() {
    return this.samples.map((sample) => ({ ...sample }));
  }

  toCsv() {
    const lines = [FILE_VERSION];
    for (const sample of this.samples) {
      lines.push(`${sample.timeMillis},${formatOffset(sample.longitudeOffsetSeconds)}`);
    }
    return `${lines.join('\n')}\n`;
  }

  readFrom(text) {
    this.samples = [];
    const lines = String(text).split(/\n/);
    const version = lines.length === 0 ? undefined : lines[0].replace(/\r$/, '');
    if (version === undefined || version === '') return;
    if (version !== FILE_VERSION) return;
    let lastTime = Number.NEGATIVE_INFINITY;
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index].replace(/\r$/, '');
      if (line === '') continue;
      const comma = line.indexOf(',');
      if (comma <= 0) continue;
      const time = parseLong(line.slice(0, comma));
      const offset = parseDouble(line.slice(comma + 1));
      if (time === null || offset === null) continue;
      if (time < lastTime) continue;
      this.samples.push({ timeMillis: time, longitudeOffsetSeconds: offset });
      lastTime = time;
    }
  }

  evict(nowMillis) {
    const cutoff = nowMillis - this.windowMillis;
    while (this.samples.length >= 2) {
      const second = this.samples[1];
      if (second.timeMillis <= cutoff) this.samples.shift();
      else break;
    }
  }
}

function formatOffset(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
    useGrouping: false,
    roundingMode: 'halfExpand',
    signDisplay: 'auto',
  }).format(value);
}

function parseLong(text) {
  const trimmed = text.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

function parseDouble(text) {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

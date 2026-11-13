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

import { SECONDS_PER_DAY, SolarEngine, wrapSignedSeconds } from './solar-engine.js';
import {
  civilClock,
  civilOffsetMessage,
  formatCoordinatePair,
  formatFixed,
  formatHms,
  formatSignedMinSec,
  sunTimesText,
} from './format.js';
import { gpsIntervalMillis } from './location-policy.js';

export const UI_PERIOD_MS = 100;
export const PERSIST_INTERVAL_MS = 60_000;

const SOLAR_PLACEHOLDER = '--:--:--.-';

/**
 * Port of SolarViewModel.render. Recording the 24-hour window is part of
 * rendering, same as the Android view model.
 */
export function renderView({
  now,
  location,
  permission,
  providerUnavailable = false,
  showDebug = false,
  manualEditorOpen = false,
  dayTotal,
  engine = new SolarEngine(),
  timeZone,
}) {
  const gpsAllowed = permission === 'granted';
  const status = locationStatus(location, permission, providerUnavailable, gpsAllowed);
  const trackGps = (permission === 'granted' || permission === 'prompt') &&
    location.source !== 'manual';
  const showManualEntry = location.source === 'manual' ||
    status === 'denied' ||
    status === 'unavailable' ||
    manualEditorOpen;
  const { text: regularTimeText, localSeconds } = civilClock(now, timeZone);
  const interval = gpsIntervalMillis(location.speedMps);

  if (!location.hasFix) {
    return {
      regularTimeText,
      solarTimeText: SOLAR_PLACEHOLDER,
      solarVelocityText: '',
      runningTotalText: '',
      eotText: '',
      civilOffsetText: '',
      locationText: locationMessage(status),
      sunTimesText: '',
      engineStatusText: 'Engine: waiting',
      showEngineStatus: showDebug,
      polar: false,
      locationStatus: status,
      showManualEntry,
      showPermissionBanner: status === 'denied' || status === 'need',
      showUseGps: showManualEntry && permission !== 'unsupported' && location.source !== 'gps',
      trackGps,
      gpsIntervalMillis: interval,
      sunAltitudeDeg: 0,
      solarTimeFraction: 0.5,
      sunriseFraction: null,
      sunsetFraction: null,
      polarDay: false,
      polarNight: false,
      solarClockContentDescription: 'Solar time unavailable',
      sunArcContentDescription: '',
      showSunArc: false,
    };
  }

  const data = engine.calculate(location.latitude, location.longitude, location.eastSpeedMps, now);
  dayTotal.record(now, data.longitudeOffsetSeconds);
  const runningTotalSeconds = dayTotal.totalSeconds(now, data.longitudeOffsetSeconds);
  const solarText = formatHms(data.solarTimeSeconds, true);

  return {
    regularTimeText,
    solarTimeText: solarText,
    solarVelocityText: `Solar velocity ${formatFixed(data.solarVelocity, 5)}x`,
    runningTotalText: `24h ${formatSignedMinSec(runningTotalSeconds)}`,
    eotText: `Equation of time ${formatFixed(data.eotSeconds / 60, 1, { signed: true })} min`,
    civilOffsetText: civilOffsetMessage(wrapSignedSeconds(localSeconds - data.solarTimeSeconds)),
    locationText: locationFixText(location),
    sunTimesText: sunTimesText(data, timeZone),
    engineStatusText: `Engine: ${formatFixed(1000 / UI_PERIOD_MS, 0)} Hz · GPS ${formatFixed(1000 / interval, 1)} Hz`,
    showEngineStatus: showDebug,
    polar: data.isPolarDampened,
    locationStatus: status,
    showManualEntry,
      showPermissionBanner: status === 'denied',
      showUseGps: showManualEntry && permission !== 'unsupported' && location.source !== 'gps',
    trackGps,
    gpsIntervalMillis: interval,
    sunAltitudeDeg: data.sunAltitudeDeg,
    solarTimeFraction: data.solarTimeSeconds / SECONDS_PER_DAY,
    sunriseFraction: data.sunriseSolarSeconds == null ? null : data.sunriseSolarSeconds / SECONDS_PER_DAY,
    sunsetFraction: data.sunsetSolarSeconds == null ? null : data.sunsetSolarSeconds / SECONDS_PER_DAY,
    polarDay: data.isPolarDay,
    polarNight: data.isPolarNight,
    solarClockContentDescription: `Apparent solar time ${formatHms(data.solarTimeSeconds, false)}`,
    sunArcContentDescription: `Sun altitude ${formatFixed(data.sunAltitudeDeg, 0)} degrees`,
    showSunArc: status === 'gps' || status === 'manual',
  };
}

function locationStatus(location, permission, providerUnavailable, gpsAllowed) {
  if (location.source === 'manual') return 'manual';
  if (!gpsAllowed && permission === 'denied') return 'denied';
  if (permission === 'unsupported') return 'unavailable';
  if (!gpsAllowed) return 'need';
  if (providerUnavailable && !location.hasFix) return 'unavailable';
  if (location.hasFix) return 'gps';
  return 'waiting';
}

function locationMessage(status) {
  if (status === 'need' || status === 'denied') {
    return 'Location permission needed — tap to allow, or enter coordinates';
  }
  if (status === 'unavailable') return 'Location unavailable — enter coordinates';
  if (status === 'waiting') return 'Waiting for GPS…';
  return '';
}

function locationFixText(location) {
  const pair = formatCoordinatePair(location.latitude, location.longitude);
  if (location.source === 'manual') return `Manual ${pair}`;
  if (location.accuracyM != null) {
    return `${pair}  ±${formatFixed(location.accuracyM, 0)} m`;
  }
  return pair;
}

export function emptyLocation() {
  return {
    latitude: 0,
    longitude: 0,
    eastSpeedMps: 0,
    speedMps: 0,
    accuracyM: null,
    hasFix: false,
    source: 'none',
  };
}

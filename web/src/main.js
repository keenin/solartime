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

import { SolarEngine } from './solar-engine.js';
import { SolarDayTotal } from './solar-day-total.js';
import {
  chooseBootLocation,
  emptyLocation,
  PERSIST_INTERVAL_MS,
  renderView,
  UI_PERIOD_MS,
} from './present.js';
import {
  COARSE_POSITION_OPTIONS,
  coarseFixBlocked,
  eastSpeedFromFix,
  gpsIntervalMillis,
  isValidLatitude,
  isValidLongitude,
  parseCoordinate,
  shouldAcceptFix,
  shouldRequestCoarseFix,
} from './location-policy.js';
import {
  LAST_FIX_PERSIST_MS,
  loadDayTotalCsv,
  loadLastFix,
  loadSettings,
  saveDayTotalCsv,
  saveLastFix,
  saveSettings,
  TEXT_SCALES,
  textScaleValue,
} from './storage.js';
import { drawSunArc } from './sun-arc.js';
import { registerServiceWorker } from './sw-client.js';
import { WEB_VERSION_LABEL } from './version.js';

const INVALID_LOCATION = 'Enter latitude −90 to 90 and longitude −180 to 180';

const engine = new SolarEngine();
const dayTotal = new SolarDayTotal();
let settings = loadSettings();
let location = emptyLocation();
let lastGps = null;
let permission = 'unknown';
let providerUnavailable = false;
let manualEditorOpen = false;
let showDebug = settings.showDebug;
let historyReady = false;
let lastPersistAt = 0;
const pendingWindow = new SolarDayTotal();
let lastAcceptedFix = 0;
let watchId = null;
let watchInterval = null;
let coarseRequested = false;
let lastFixPersistAt = 0;
let persistableFix = null;
let fittedScale = null;
let fittedLength = -1;
let fittedWidth = 0;
let wakeLock = null;
let holdTimer = 0;

const dom = {
  polar: document.querySelector('#polar-warning'),
  banner: document.querySelector('#permission-banner'),
  civil: document.querySelector('#civil-time'),
  solar: document.querySelector('#solar-time'),
  velocity: document.querySelector('#solar-velocity'),
  running: document.querySelector('#running-total'),
  eot: document.querySelector('#eot'),
  offset: document.querySelector('#civil-offset'),
  location: document.querySelector('#location'),
  arc: document.querySelector('#sun-arc'),
  sunTimes: document.querySelector('#sun-times'),
  daylight: document.querySelector('#daylight'),
  daylightChange: document.querySelector('#daylight-change'),
  engine: document.querySelector('#engine-status'),
  manual: document.querySelector('#manual-form'),
  latitude: document.querySelector('#latitude'),
  longitude: document.querySelector('#longitude'),
  error: document.querySelector('#manual-error'),
  useGps: document.querySelector('#use-location'),
  settingsButton: document.querySelector('#settings-button'),
  settingsDrawer: document.querySelector('#settings-drawer'),
  settingsScrim: document.querySelector('#settings-scrim'),
  settingsClose: document.querySelector('#settings-close'),
  showEngine: document.querySelector('#show-engine'),
  version: document.querySelector('#web-version'),
};

dom.version.textContent = WEB_VERSION_LABEL;

applyTextScale(settings.textScale);
dom.latitude.value = settings.manualLat;
dom.longitude.value = settings.manualLon;
dom.showEngine.checked = showDebug;
for (const input of document.querySelectorAll('input[name="text-scale"]')) {
  input.checked = input.value === settings.textScale;
}

let manual = null;
if (settings.mode === 'manual') {
  const latitude = parseCoordinate(settings.manualLat);
  const longitude = parseCoordinate(settings.manualLon);
  if (latitude != null && longitude != null && isValidLatitude(latitude) && isValidLongitude(longitude)) {
    manual = manualLocation(latitude, longitude);
    manualEditorOpen = true;
  }
}
const booted = chooseBootLocation({ manual, saved: loadLastFix() });
location = booted.location;
lastGps = booted.lastGps;

dom.banner.addEventListener('click', () => {
  beginDeviceLocation();
});
dom.location.addEventListener('click', () => {
  if (location.source === 'manual') {
    manualEditorOpen = true;
  } else {
    manualEditorOpen = !manualEditorOpen;
  }
  render();
});
dom.manual.addEventListener('submit', (event) => {
  event.preventDefault();
  applyManualLocation();
});
dom.useGps.addEventListener('click', () => {
  useDeviceLocation();
});
dom.settingsButton.addEventListener('click', () => openSettings());
dom.settingsClose.addEventListener('click', () => closeSettings());
dom.settingsScrim.addEventListener('click', () => closeSettings());
dom.showEngine.addEventListener('change', () => {
  showDebug = dom.showEngine.checked;
  settings.showDebug = showDebug;
  saveSettings(settings);
  render();
});
for (const input of document.querySelectorAll('input[name="text-scale"]')) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    settings.textScale = input.value;
    saveSettings(settings);
    applyTextScale(settings.textScale);
    render();
  });
}

dom.solar.addEventListener('pointerdown', () => {
  window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => toggleDebug(), 550);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  dom.solar.addEventListener(type, () => window.clearTimeout(holdTimer));
}
dom.solar.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSettings();
});

document.addEventListener('pointerdown', () => {
  requestWakeLock();
}, { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
  if (document.visibilityState === 'hidden') {
    persistDayTotal();
    flushLastFix();
  }
});
window.addEventListener('pagehide', () => {
  persistDayTotal();
  flushLastFix();
});

syncThemeColor();
window.addEventListener('resize', () => {
  fittedScale = null;
  fittedLength = -1;
  fittedWidth = 0;
  fitSolarClock();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);

boot();

function boot() {
  window.setInterval(render, UI_PERIOD_MS);
  render();
  loadDayTotalCsv().then((csv) => {
    if (csv) dayTotal.readFrom(csv);
  }).catch(() => {
    // History is optional. The clock still runs.
  }).finally(() => {
    historyReady = true;
    lastPersistAt = Date.now();
    render();
  });
  resolvePermission().finally(() => {
    render();
  });
  registerServiceWorker();
}

async function resolvePermission() {
  if (!navigator.geolocation) {
    permission = 'unsupported';
    manualEditorOpen = true;
    return;
  }
  if (location.source === 'manual') {
    permission = 'prompt';
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        permission = status.state;
        status.onchange = () => {
          permission = status.state;
          render();
        };
      } catch {
        permission = 'prompt';
      }
    }
    return;
  }
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      permission = status.state;
      status.onchange = () => {
        permission = status.state;
        render();
      };
      return;
    } catch {
      // The Permissions API can reject the name. Asking via watchPosition still works.
    }
  }
  permission = 'prompt';
}

function render() {
  const view = renderView({
    now: Date.now(),
    location,
    permission,
    providerUnavailable,
    showDebug,
    manualEditorOpen,
    dayTotal: historyReady ? dayTotal : pendingWindow,
    engine,
    timeZone: undefined,
  });
  paint(view);
  syncLocationUpdates(view);
  if (historyReady) maybePersist(Date.now());
}

function paint(view) {
  dom.civil.textContent = view.regularTimeText;
  dom.solar.textContent = view.solarTimeText;
  dom.solar.setAttribute('aria-label', view.solarClockContentDescription);
  dom.velocity.textContent = view.solarVelocityText;
  if (historyReady) {
    dom.running.textContent = view.runningTotalText;
    dom.running.setAttribute('aria-label', view.runningTotalText || 'Solar day length');
  }
  dom.eot.textContent = view.eotText;
  dom.offset.textContent = view.civilOffsetText;
  dom.location.textContent = view.locationText;
  dom.sunTimes.textContent = view.sunTimesText;
  dom.daylight.textContent = view.daylightText;
  dom.daylight.hidden = view.daylightText === '';
  dom.daylightChange.textContent = view.daylightChangeText;
  dom.daylightChange.hidden = view.daylightChangeText === '';
  dom.engine.textContent = view.engineStatusText;
  dom.engine.hidden = !view.showEngineStatus;
  dom.polar.hidden = !view.polar;
  dom.polar.classList.toggle('is-on', view.polar);
  dom.banner.hidden = !view.showPermissionBanner;
  dom.manual.hidden = !view.showManualEntry;
  dom.useGps.hidden = !view.showUseGps;
  dom.arc.hidden = !view.showSunArc;
  if (view.showSunArc) {
    dom.arc.setAttribute('aria-label', view.sunArcContentDescription);
    drawSunArc(dom.arc, view);
  }
  fitSolarClock();
}

function syncLocationUpdates(view) {
  if (!view.trackGps || !navigator.geolocation) {
    stopWatch();
    return;
  }
  startWatch(view.gpsIntervalMillis);
  startCoarseFix();
}

function startWatch(intervalMs) {
  if (watchId != null && watchInterval === intervalMs) return;
  stopWatch();
  watchInterval = intervalMs;
  watchId = navigator.geolocation.watchPosition(onFix, onFixError, {
    enableHighAccuracy: true,
    maximumAge: Math.max(0, Math.floor(intervalMs / 2)),
    timeout: Math.max(intervalMs * 2, 10_000),
  });
}

function stopWatch() {
  if (watchId == null || !navigator.geolocation) {
    watchId = null;
    watchInterval = null;
    return;
  }
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
  watchInterval = null;
}

function startCoarseFix() {
  if (!navigator.geolocation || coarseFixBlocked(location)) return;
  if (!shouldRequestCoarseFix({
    permission,
    alreadyRequested: coarseRequested,
    manual: location.source === 'manual',
  })) return;
  coarseRequested = true;
  try {
    navigator.geolocation.getCurrentPosition(onCoarseFix, () => {}, COARSE_POSITION_OPTIONS);
  } catch {
    coarseRequested = false;
  }
}

function onFix(position) {
  const speed = Number.isFinite(position.coords.speed) ? position.coords.speed : 0;
  const nextInterval = gpsIntervalMillis(speed);
  const timestamp = position.timestamp || Date.now();
  const activeInterval = watchInterval ?? nextInterval;
  if (!shouldAcceptFix(lastAcceptedFix, timestamp, activeInterval) && nextInterval >= activeInterval) {
    return;
  }
  lastAcceptedFix = timestamp;
  commitFix(position, {
    speedMps: speed,
    eastSpeedMps: eastSpeedFromFix(position.coords.speed, position.coords.heading),
    coarse: false,
    timestamp,
  });
}

function onCoarseFix(position) {
  if (!position?.coords || coarseFixBlocked(location)) return;
  const { latitude, longitude } = position.coords;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return;
  // Leave lastAcceptedFix alone so the high-accuracy watch still supersedes this.
  commitFix(position, {
    speedMps: 0,
    eastSpeedMps: 0,
    coarse: true,
    timestamp: position.timestamp || Date.now(),
  });
}

function commitFix(position, { speedMps, eastSpeedMps, coarse, timestamp }) {
  providerUnavailable = false;
  permission = 'granted';
  const fix = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    eastSpeedMps,
    speedMps,
    accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    hasFix: true,
    source: 'gps',
    stale: false,
    coarse,
    timestamp,
  };
  lastGps = fix;
  if (location.source !== 'manual') location = fix;
  rememberFix(fix);
  render();
}

function onFixError(error) {
  if (error && error.code === 1) {
    permission = 'denied';
    providerUnavailable = false;
    if (location.source !== 'manual') manualEditorOpen = true;
    else dom.error.textContent = 'Location permission is blocked for this site. Enter coordinates, or allow location and try again.';
  } else if (error && error.code === 2) {
    providerUnavailable = true;
    if (location.source !== 'manual') manualEditorOpen = true;
  }
  render();
}

function applyManualLocation() {
  const latitude = parseCoordinate(dom.latitude.value);
  const longitude = parseCoordinate(dom.longitude.value);
  if (latitude == null || longitude == null || !isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    dom.error.textContent = INVALID_LOCATION;
    return;
  }
  dom.error.textContent = '';
  stopWatch();
  location = manualLocation(latitude, longitude);
  manualEditorOpen = true;
  settings.mode = 'manual';
  settings.manualLat = dom.latitude.value.trim();
  settings.manualLon = dom.longitude.value.trim();
  saveSettings(settings);
  render();
}

function useDeviceLocation() {
  settings.mode = 'device';
  saveSettings(settings);
  manualEditorOpen = false;
  location = lastGps ? { ...lastGps, source: 'gps' } : emptyLocation();
  lastAcceptedFix = 0;
  watchInterval = null;
  beginDeviceLocation();
}

function beginDeviceLocation() {
  if (!navigator.geolocation) {
    permission = 'unsupported';
    manualEditorOpen = true;
    render();
    return;
  }
  if (permission === 'denied') {
    manualEditorOpen = true;
    render();
    return;
  }
  if (permission !== 'granted') permission = 'prompt';
  watchInterval = null;
  render();
}

function manualLocation(latitude, longitude) {
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

function toggleDebug() {
  showDebug = !showDebug;
  settings.showDebug = showDebug;
  dom.showEngine.checked = showDebug;
  saveSettings(settings);
  render();
}

function openSettings() {
  dom.settingsDrawer.classList.add('is-open');
  dom.settingsScrim.classList.add('is-open');
  dom.settingsDrawer.inert = false;
  dom.settingsDrawer.setAttribute('aria-hidden', 'false');
  dom.settingsButton.setAttribute('aria-expanded', 'true');
  dom.settingsClose.focus();
}

function closeSettings() {
  if (!dom.settingsDrawer.classList.contains('is-open')) return;
  dom.settingsDrawer.classList.remove('is-open');
  dom.settingsScrim.classList.remove('is-open');
  dom.settingsDrawer.inert = true;
  dom.settingsDrawer.setAttribute('aria-hidden', 'true');
  dom.settingsButton.setAttribute('aria-expanded', 'false');
  dom.settingsButton.focus();
}

function applyTextScale(id) {
  document.documentElement.style.setProperty('--text-scale', String(textScaleValue(id)));
  fittedScale = null;
  fittedLength = -1;
  fittedWidth = 0;
}

function fitSolarClock() {
  const scale = textScaleValue(settings.textScale);
  const length = dom.solar.textContent.length;
  const width = dom.solar.clientWidth;
  if (!width) return;
  if (fittedScale === scale && fittedLength === length && fittedWidth === width) return;
  dom.solar.style.fontSize = '';
  let size = parseFloat(getComputedStyle(dom.solar).fontSize);
  if (!Number.isFinite(size)) size = 52 * scale;
  const min = Math.max(16, 28 * scale);
  const overflows = () => dom.solar.scrollWidth > width + 1;
  if (overflows()) {
    const span = dom.solar.scrollWidth;
    if (span > 0) {
      size = Math.max(min, Math.floor((size * width) / span));
      dom.solar.style.fontSize = `${size}px`;
    }
    let guard = 0;
    while (overflows() && size > min && guard < 4) {
      size -= 1;
      dom.solar.style.fontSize = `${size}px`;
      guard += 1;
    }
  }
  fittedScale = scale;
  fittedLength = length;
  fittedWidth = width;
}

function syncThemeColor() {
  const color = getComputedStyle(document.documentElement).backgroundColor;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

function maybePersist(now) {
  if (now - lastPersistAt < PERSIST_INTERVAL_MS) return;
  lastPersistAt = now;
  persistDayTotal();
}

function rememberFix(fix) {
  const replacingCoarse = persistableFix?.coarse === true && !fix.coarse;
  persistableFix = {
    lat: fix.latitude,
    lon: fix.longitude,
    accuracy: fix.accuracyM,
    timestamp: Number.isFinite(fix.timestamp) ? fix.timestamp : Date.now(),
    coarse: Boolean(fix.coarse),
  };
  const now = Date.now();
  if (!replacingCoarse && !shouldAcceptFix(lastFixPersistAt, now, LAST_FIX_PERSIST_MS)) return;
  lastFixPersistAt = now;
  saveLastFix(persistableFix);
}

function flushLastFix() {
  if (!persistableFix) return;
  saveLastFix(persistableFix);
  lastFixPersistAt = Date.now();
}

function persistDayTotal() {
  if (!historyReady) return;
  saveDayTotalCsv(dayTotal.toCsv());
}

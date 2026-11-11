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
 * Line-by-line port of app/src/main/java/com/example/solartime/SolarEngine.kt.
 * Spencer's Fourier series for the equation of time and solar declination,
 * sunrise at −0.833°, and the same polar-motion dampening.
 */

export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_DEGREE = 240;
export const SOLAR_NOON_SECONDS = 43200;
export const EQUATORIAL_ROTATION_MPS = 465.1;
export const POLAR_WARNING_LATITUDE = 85;
const SUNRISE_ALTITUDE_DEG = -0.833;

/** Kotlin Double.mod: non-negative remainder. */
export function wrapSeconds(seconds) {
  const remainder = seconds % SECONDS_PER_DAY;
  return remainder < 0 ? remainder + SECONDS_PER_DAY : remainder;
}

export function wrapSignedSeconds(seconds) {
  return wrapSeconds(seconds + SECONDS_PER_DAY / 2) - SECONDS_PER_DAY / 2;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function equationOfTime(gamma) {
  const k = 229.18;
  const eotMinutes = k * (
    0.000075 +
    0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)
  );
  // d/dγ of the NOAA/Spencer series; 2γ terms pick up a factor of 2.
  const deotMinutesDGamma = k * (
    -0.001868 * Math.sin(gamma) - 0.032077 * Math.cos(gamma) +
    0.029230 * Math.sin(2 * gamma) - 0.081698 * Math.cos(2 * gamma)
  );
  const dGammaDt = (2 * Math.PI) / (365 * SECONDS_PER_DAY);
  return [eotMinutes * 60, deotMinutesDGamma * dGammaDt * 60];
}

function solarDeclination(gamma) {
  return 0.006918 -
    0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
}

function altitude(latRad, declination, hourAngleRad) {
  const sinAlt = Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngleRad);
  return toDegrees(Math.asin(clamp(sinAlt, -1, 1)));
}

function sunriseSunset(latRad, declination) {
  const altRef = toRadians(SUNRISE_ALTITUDE_DEG);
  const denom = Math.cos(latRad) * Math.cos(declination);
  if (Math.abs(denom) < 1e-12) {
    const alwaysUp = Math.sin(latRad) * Math.sin(declination) - Math.sin(altRef) > 0;
    return {
      sunriseSolarSeconds: null,
      sunsetSolarSeconds: null,
      polarDay: alwaysUp,
      polarNight: !alwaysUp,
    };
  }
  const cosOmega = (Math.sin(altRef) - Math.sin(latRad) * Math.sin(declination)) / denom;
  if (cosOmega < -1 || cosOmega > 1) {
    return {
      sunriseSolarSeconds: null,
      sunsetSolarSeconds: null,
      polarDay: cosOmega < -1,
      polarNight: cosOmega > 1,
    };
  }
  const omegaSeconds = toDegrees(Math.acos(clamp(cosOmega, -1, 1))) * SECONDS_PER_DEGREE;
  return {
    sunriseSolarSeconds: wrapSeconds(SOLAR_NOON_SECONDS - omegaSeconds),
    sunsetSolarSeconds: wrapSeconds(SOLAR_NOON_SECONDS + omegaSeconds),
    polarDay: false,
    polarNight: false,
  };
}

function utcMillisForSolarSeconds(
  nowUtcMillis,
  nowUtcSecondsOfDay,
  targetSolarSeconds,
  longitudeOffsetSeconds,
  eotSeconds,
) {
  const targetUtcSeconds = wrapSeconds(targetSolarSeconds - longitudeOffsetSeconds - eotSeconds);
  let delta = targetUtcSeconds - nowUtcSecondsOfDay;
  if (delta > SECONDS_PER_DAY / 2) delta -= SECONDS_PER_DAY;
  if (delta < -SECONDS_PER_DAY / 2) delta += SECONDS_PER_DAY;
  return nowUtcMillis + Math.trunc(delta * 1000);
}

function utcFields(utcMillis) {
  const date = new Date(utcMillis);
  const year = date.getUTCFullYear();
  const dayStart = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const yearStart = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((dayStart - yearStart) / 86_400_000) + 1;
  const hourFrac = date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;
  return { dayOfYear, hourFrac };
}

export class SolarEngine {
  constructor(clock = () => Date.now()) {
    this.clock = clock;
  }

  calculate(latitude, longitude, eastSpeedMps = 0, utcMillis = this.clock()) {
    const { dayOfYear, hourFrac } = utcFields(utcMillis);
    const gamma = (2 * Math.PI) / 365 * (dayOfYear - 1 + (hourFrac - 12) / 24);
    const [eotSeconds, eotRate] = equationOfTime(gamma);
    const longitudeOffsetSeconds = longitude * SECONDS_PER_DEGREE;

    const utcSecondsOfDay = hourFrac * 3600;
    const solarTimeSeconds = wrapSeconds(utcSecondsOfDay + longitudeOffsetSeconds + eotSeconds);

    const latRad = toRadians(latitude);
    const earthRotationMps = EQUATORIAL_ROTATION_MPS * Math.cos(latRad);
    const polarDampened = Math.abs(latitude) > POLAR_WARNING_LATITUDE || Math.abs(earthRotationMps) <= 1;
    const relativeVelocity = polarDampened ? 0 : eastSpeedMps / earthRotationMps;
    const solarVelocity = 1 + eotRate + relativeVelocity;

    const declination = solarDeclination(gamma);
    const hourAngleRad = toRadians((solarTimeSeconds - SOLAR_NOON_SECONDS) / SECONDS_PER_DEGREE);
    const altitudeDeg = altitude(latRad, declination, hourAngleRad);
    const sun = sunriseSunset(latRad, declination);

    const eventUtc = (targetSolarSeconds) => utcMillisForSolarSeconds(
      utcMillis,
      utcSecondsOfDay,
      targetSolarSeconds,
      longitudeOffsetSeconds,
      eotSeconds,
    );

    return {
      utcMillis,
      solarTimeSeconds,
      eotSeconds,
      eotRate,
      longitudeOffsetSeconds,
      solarVelocity,
      sunAltitudeDeg: altitudeDeg,
      sunriseSolarSeconds: sun.sunriseSolarSeconds,
      sunsetSolarSeconds: sun.sunsetSolarSeconds,
      solarNoonUtcMillis: eventUtc(SOLAR_NOON_SECONDS),
      sunriseUtcMillis: sun.sunriseSolarSeconds == null ? null : eventUtc(sun.sunriseSolarSeconds),
      sunsetUtcMillis: sun.sunsetSolarSeconds == null ? null : eventUtc(sun.sunsetSolarSeconds),
      isPolarDay: sun.polarDay,
      isPolarNight: sun.polarNight,
      isPolarDampened: polarDampened,
    };
  }
}

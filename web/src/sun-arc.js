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
 * Port of SunArcView. Midnight is at the bottom, 06:00 left, noon top, 18:00 right.
 * Canvas 0° is 3 o'clock and positive sweep is clockwise, same as Android.
 */

export function drawSunArc(canvas, state) {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth <= 0 || cssHeight <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');
  const styles = getComputedStyle(canvas);
  const color = (name) => styles.getPropertyValue(name).trim();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const stroke = 6;
  const pad = stroke + 16;
  const size = Math.min(cssWidth - pad * 2, cssHeight - pad * 2);
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  const radius = size / 2;

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('--arc-night');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = color('--arc-horizon');
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.stroke();

  ctx.lineWidth = stroke;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('--arc-day');
  if (state.polarDay) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (!state.polarNight && state.sunriseFraction != null && state.sunsetFraction != null) {
    const start = androidAngle(state.sunriseFraction);
    let sweep = (state.sunsetFraction - state.sunriseFraction) * 360;
    if (sweep < 0) sweep += 360;
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius,
      (start * Math.PI) / 180,
      ((start + sweep) * Math.PI) / 180,
      false,
    );
    ctx.stroke();
  }

  const angleRad = (androidAngle(state.solarTimeFraction) * Math.PI) / 180;
  const sunX = cx + radius * Math.cos(angleRad);
  const sunY = cy + radius * Math.sin(angleRad);
  const sunRadius = 10;
  const above = state.sunAltitudeDeg > -0.833 || state.polarDay;
  if (above) {
    ctx.fillStyle = color('--arc-glow');
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color('--arc-sun');
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color('--arc-sun-night');
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function androidAngle(fraction) {
  return 90 + fraction * 360;
}

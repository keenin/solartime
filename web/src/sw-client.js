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

const SERVICE_WORKER_URL = '/sw.js';

/**
 * Same-origin /sw.js only. serviceWorker.register is a TrustedScriptURL
 * sink, so a raw string is rejected when Trusted Types are enforced.
 */
function serviceWorkerScriptUrl() {
  if (!window.trustedTypes?.createPolicy) return SERVICE_WORKER_URL;
  const policy = window.trustedTypes.createPolicy('solar-sw', {
    createScriptURL(value) {
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== SERVICE_WORKER_URL) {
        throw new TypeError('Refusing to register a service worker from another URL');
      }
      return url.pathname;
    },
  });
  return policy.createScriptURL(SERVICE_WORKER_URL);
}

/**
 * Reload once when a new service worker takes over a page that was already
 * controlled. The first claim does not reload, so typing is not discarded.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let refreshing = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register(serviceWorkerScriptUrl()).catch(() => {
    // Offline install can fail on the very first visit. The page still runs.
  });
}

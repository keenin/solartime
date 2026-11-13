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
 * User-visible web version. Bump this on every change.
 * The settings drawer and the service worker cache name both read it.
 * See AGENTS.md.
 */
export const WEB_VERSION = '1.0.0';

export const WEB_VERSION_LABEL = `Web version ${WEB_VERSION}`;

export const SERVICE_WORKER_CACHE = `solartime-${WEB_VERSION}`;

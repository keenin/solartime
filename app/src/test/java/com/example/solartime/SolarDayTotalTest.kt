/*
 * Copyright (C) 2026 Keenin Krehbiel
 * Written entirely by Grok (xAI). SPDX-License-Identifier: GPL-2.0-only
 */

package com.example.solartime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.StringReader
import java.io.StringWriter

class SolarDayTotalTest {

    @Test
    fun total_isZeroWithNoSamples() {
        val window = SolarDayTotal()
        assertEquals(0.0, window.totalSeconds(1_000L, 0.0), 0.0)
        assertEquals(0, window.sampleCount)
    }

    @Test
    fun total_isZeroWhenStationary() {
        val window = SolarDayTotal()
        val offset = 15.0 * SolarEngine.SECONDS_PER_DEGREE
        window.record(0L, offset)
        window.record(60_000L, offset)
        assertEquals(0.0, window.totalSeconds(60_000L, offset), 1e-9)
    }

    @Test
    fun total_westboundLengthensAndEastboundShortens() {
        val west = SolarDayTotal()
        val westOneDegree = -SolarEngine.SECONDS_PER_DEGREE
        west.record(0L, 0.0)
        west.record(3_600_000L, westOneDegree)
        assertEquals(240.0, west.totalSeconds(3_600_000L, westOneDegree), 1e-9)

        val east = SolarDayTotal()
        val eastOneDegree = SolarEngine.SECONDS_PER_DEGREE
        east.record(0L, 0.0)
        east.record(3_600_000L, eastOneDegree)
        assertEquals(-240.0, east.totalSeconds(3_600_000L, eastOneDegree), 1e-9)
    }

    @Test
    fun total_dropsSamplesOlderThanWindow() {
        val window = SolarDayTotal(windowMillis = 60_000L, minSampleIntervalMillis = 1_000L)
        window.record(0L, 0.0)
        window.record(1_000L, 100.0)
        window.record(61_000L, 250.0)
        assertEquals(-150.0, window.totalSeconds(61_000L, 250.0), 1e-9)
        assertTrue(window.sampleCount <= 2)
    }

    @Test
    fun total_keepsOldestSampleBeforeCutoffForBaseline() {
        val window = SolarDayTotal(windowMillis = 60_000L, minSampleIntervalMillis = 1_000L)
        window.record(0L, 0.0)
        window.record(90_000L, 80.0)
        assertEquals(-80.0, window.totalSeconds(90_000L, 80.0), 1e-9)
        assertEquals(2, window.sampleCount)
    }

    @Test
    fun total_rateLimitsSubIntervalSamples() {
        val window = SolarDayTotal(minSampleIntervalMillis = 1_000L)
        window.record(0L, 0.0)
        window.record(100L, 50.0)
        window.record(999L, 90.0)
        window.record(1_000L, 40.0)
        assertEquals(2, window.sampleCount)
        assertEquals(-40.0, window.totalSeconds(1_000L, 40.0), 1e-9)
    }

    @Test
    fun total_ignoresBackwardsTimestamps() {
        val window = SolarDayTotal()
        window.record(5_000L, 10.0)
        window.record(4_000L, 999.0)
        assertEquals(1, window.sampleCount)
        assertEquals(-5.0, window.totalSeconds(5_000L, 15.0), 1e-9)
    }

    @Test
    fun total_wrapsAntimeridianEastwardAsSmallNegative() {
        val window = SolarDayTotal()
        val start = 179.0 * SolarEngine.SECONDS_PER_DEGREE
        val end = -179.0 * SolarEngine.SECONDS_PER_DEGREE
        window.record(0L, start)
        window.record(3_600_000L, end)
        assertEquals(-480.0, window.totalSeconds(3_600_000L, end), 1e-9)
    }

    @Test
    fun total_tracksLiveOffsetAtSolarVelocityUiRate() {
        val window = SolarDayTotal(minSampleIntervalMillis = 1_000L)
        val uiPeriodMs = SolarViewModel.UI_PERIOD_MS
        for (i in 0..30) {
            val t = i * uiPeriodMs
            val offset = (t / 1000.0) * SolarEngine.SECONDS_PER_DEGREE
            window.record(t, offset)
            assertEquals(-offset, window.totalSeconds(t, offset), 1e-9)
        }
        assertEquals(4, window.sampleCount)
    }

    @Test
    fun total_usesLiveOffsetEvenWithoutNewSample() {
        val window = SolarDayTotal(minSampleIntervalMillis = 1_000L)
        window.record(0L, 0.0)
        assertEquals(-120.0, window.totalSeconds(400L, 120.0), 1e-9)
    }

    @Test
    fun roundTrip_preservesSamples() {
        val window = SolarDayTotal()
        window.record(1_000L, 12.5)
        window.record(2_000L, -240.0)
        window.record(3_000L, 480.25)
        val encoded = StringWriter()
        BufferedWriter(encoded).use { window.writeTo(it) }

        val restored = SolarDayTotal()
        BufferedReader(StringReader(encoded.toString())).use { restored.readFrom(it) }

        assertEquals(window.snapshot(), restored.snapshot())
        assertEquals(
            window.totalSeconds(3_000L, 480.25),
            restored.totalSeconds(3_000L, 480.25),
            1e-6,
        )
    }

    @Test
    fun readFrom_ignoresUnknownVersionAndBadLines() {
        val window = SolarDayTotal()
        window.record(5L, 5.0)
        BufferedReader(StringReader("v0\n1000,1.0\n")).use { window.readFrom(it) }
        assertEquals(0, window.sampleCount)

        val mixed = "v1\nbad\n2000,not-a-number\n3000,15.0\n2000,1.0\n"
        BufferedReader(StringReader(mixed)).use { window.readFrom(it) }
        assertEquals(1, window.sampleCount)
        assertEquals(3000L, window.snapshot().single().timeMillis)
        assertEquals(15.0, window.snapshot().single().longitudeOffsetSeconds, 0.0)
    }

    @Test
    fun formatSignedMinSec_matchesRequestedStyle() {
        assertEquals("+12 min 34 sec", SolarDayTotal.formatSignedMinSec(12 * 60 + 34.0))
        assertEquals("-7 min 12 sec", SolarDayTotal.formatSignedMinSec(-(7 * 60 + 12.0)))
        assertEquals("+0 min 00 sec", SolarDayTotal.formatSignedMinSec(0.0))
        assertEquals("+0 min 00 sec", SolarDayTotal.formatSignedMinSec(0.4))
        assertEquals("-0 min 01 sec", SolarDayTotal.formatSignedMinSec(-0.5))
        assertEquals("+1 h 2 min 03 sec", SolarDayTotal.formatSignedMinSec(3600 + 2 * 60 + 3.0))
        assertEquals("-3 h 0 min 00 sec", SolarDayTotal.formatSignedMinSec(-3 * 3600.0))
    }

    @Test
    fun formatUnsignedMinSec_includesSeconds() {
        assertEquals("17 min 12 sec", SolarDayTotal.formatUnsignedMinSec(17 * 60 + 12.0))
        assertEquals("7 min 00 sec", SolarDayTotal.formatUnsignedMinSec(7 * 60.0))
        assertEquals("12 sec", SolarDayTotal.formatUnsignedMinSec(12.0))
        assertEquals("1 sec", SolarDayTotal.formatUnsignedMinSec(0.6))
        assertEquals("0 sec", SolarDayTotal.formatUnsignedMinSec(0.4))
        assertEquals("1 h 2 min 03 sec", SolarDayTotal.formatUnsignedMinSec(3600 + 2 * 60 + 3.0))
    }
}

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

package com.example.solartime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone
import kotlin.math.abs

class SolarEngineTest {

    private val engine = SolarEngine(clock = { error("clock should be passed explicitly in tests") })

    @Test
    fun calculate_returnsSolarTimeInRange() {
        val data = engine.calculate(0.0, 0.0, utcMillis = utcMillis(2024, 3, 20, 12))
        assertTrue(
            "Solar time out of bounds: ${data.solarTimeSeconds}",
            data.solarTimeSeconds in 0.0..86400.0,
        )
        assertTrue(
            "EoT out of range: ${data.eotSeconds}s",
            data.eotSeconds in -20.0 * 60..20.0 * 60,
        )
    }

    @Test
    fun calculate_withLongitudeOffset() {
        val t = utcMillis(2024, 3, 20, 12)
        val dataRef = engine.calculate(0.0, 0.0, utcMillis = t)
        val dataEast = engine.calculate(0.0, 15.0, utcMillis = t)

        var diff = dataEast.solarTimeSeconds - dataRef.solarTimeSeconds
        if (diff < -43200) diff += 86400
        if (diff > 43200) diff -= 86400

        assertEquals(3600.0, diff, 1.0)
        assertEquals(3600.0, dataEast.longitudeOffsetSeconds, 0.001)
    }

    @Test
    fun calculate_usesInjectedClock() {
        val t = utcMillis(2024, 6, 21, 0)
        val engineAtT = SolarEngine(clock = { t })
        val data = engineAtT.calculate(0.0, 0.0)
        assertEquals(t, data.utcMillis)
    }

    @Test
    fun calculate_restVelocityIsNearOne() {
        val data = engine.calculate(0.0, 0.0, eastSpeedMps = 0.0, utcMillis = utcMillis(2024, 3, 20, 12))
        assertEquals(1.0, data.solarVelocity, 0.002)
        assertEquals(data.eotRate, data.solarVelocity - 1.0, 1e-9)
    }

    @Test
    fun calculate_eastwardTravelIncreasesVelocity() {
        val t = utcMillis(2024, 3, 20, 12)
        val rest = engine.calculate(0.0, 0.0, eastSpeedMps = 0.0, utcMillis = t)
        val east = engine.calculate(0.0, 0.0, eastSpeedMps = 46.51, utcMillis = t)
        assertEquals(0.1, east.solarVelocity - rest.solarVelocity, 0.002)
    }

    @Test
    fun calculate_westwardTravelDecreasesVelocity() {
        val t = utcMillis(2024, 3, 20, 12)
        val rest = engine.calculate(0.0, 0.0, utcMillis = t)
        val west = engine.calculate(0.0, 0.0, eastSpeedMps = -46.51, utcMillis = t)
        assertEquals(-0.1, west.solarVelocity - rest.solarVelocity, 0.002)
    }

    @Test
    fun calculate_equatorEquinoxHasSunriseNearSix() {
        val data = engine.calculate(0.0, 0.0, utcMillis = utcMillis(2024, 3, 20, 12))
        val sunrise = data.sunriseSolarSeconds
        val sunset = data.sunsetSolarSeconds
        assertNotNull(sunrise)
        assertNotNull(sunset)
        assertEquals(6 * 3600.0, sunrise!!, 20 * 60.0)
        assertEquals(18 * 3600.0, sunset!!, 20 * 60.0)
        assertTrue(data.sunAltitudeDeg > 50.0)
    }

    @Test
    fun calculate_northPoleInJuneIsPolarDay() {
        val data = engine.calculate(90.0, 0.0, utcMillis = utcMillis(2024, 6, 21, 12))
        assertTrue(data.isPolarDay)
        assertNull(data.sunriseSolarSeconds)
        assertNull(data.sunsetSolarSeconds)
        assertTrue(data.isPolarDampened)
    }

    @Test
    fun calculate_northPoleInDecemberIsPolarNight() {
        val data = engine.calculate(90.0, 0.0, utcMillis = utcMillis(2024, 12, 21, 12))
        assertTrue(data.isPolarNight)
        assertNull(data.sunriseSolarSeconds)
        assertTrue(data.isPolarDampened)
    }

    @Test
    fun calculate_polarDampensRelativeVelocity() {
        val t = utcMillis(2024, 6, 21, 12)
        val rest = engine.calculate(89.9, 0.0, eastSpeedMps = 0.0, utcMillis = t)
        val moving = engine.calculate(89.9, 0.0, eastSpeedMps = 30.0, utcMillis = t)
        assertEquals(rest.solarVelocity, moving.solarVelocity, 1e-9)
    }

    @Test
    fun wrapSeconds_handlesNegativesAndOverflow() {
        assertEquals(0.0, SolarEngine.wrapSeconds(86400.0), 0.0)
        assertEquals(1.0, SolarEngine.wrapSeconds(-86399.0), 1e-9)
        assertEquals(100.0, SolarEngine.wrapSeconds(86500.0), 1e-9)
    }

    @Test
    fun gpsInterval_matchesSpeedBuckets() {
        assertEquals(2000L, SolarViewModel.gpsIntervalMillis(0f))
        assertEquals(500L, SolarViewModel.gpsIntervalMillis(5f))
        assertEquals(200L, SolarViewModel.gpsIntervalMillis(20f))
        assertEquals(100L, SolarViewModel.gpsIntervalMillis(40f))
    }

    @Test
    fun wrapSignedSeconds_staysInPlusMinusHalfDay() {
        assertEquals(3600.0, SolarEngine.wrapSignedSeconds(3600.0), 1e-9)
        assertEquals(-3600.0, SolarEngine.wrapSignedSeconds(-3600.0), 1e-9)
        assertTrue(abs(SolarEngine.wrapSignedSeconds(50000.0)) <= 43200.0)
    }

    private fun utcMillis(year: Int, month: Int, day: Int, hour: Int): Long {
        val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        calendar.clear()
        calendar.set(year, month - 1, day, hour, 0, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }
}

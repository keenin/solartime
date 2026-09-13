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

import java.util.Calendar
import java.util.TimeZone
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin

class SolarEngine(
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    data class SolarData(
        val utcMillis: Long,
        val solarTimeSeconds: Double,
        val eotSeconds: Double,
        /** Extra solar seconds per civil second from the Equation of Time changing. */
        val eotRate: Double,
        val longitudeOffsetSeconds: Double,
        val solarVelocity: Double,
        val sunAltitudeDeg: Double,
        val sunriseSolarSeconds: Double?,
        val sunsetSolarSeconds: Double?,
        val solarNoonUtcMillis: Long,
        val sunriseUtcMillis: Long?,
        val sunsetUtcMillis: Long?,
        val isPolarDay: Boolean,
        val isPolarNight: Boolean,
        val isPolarDampened: Boolean,
    )

    fun calculate(
        latitude: Double,
        longitude: Double,
        eastSpeedMps: Double = 0.0,
        utcMillis: Long = clock(),
    ): SolarData {
        val utc = Calendar.getInstance(UTC).apply { timeInMillis = utcMillis }
        val dayOfYear = utc.get(Calendar.DAY_OF_YEAR)
        val hourFrac = utc.get(Calendar.HOUR_OF_DAY) +
            utc.get(Calendar.MINUTE) / 60.0 +
            utc.get(Calendar.SECOND) / 3600.0 +
            utc.get(Calendar.MILLISECOND) / 3_600_000.0

        val gamma = 2.0 * PI / 365.0 * (dayOfYear - 1 + (hourFrac - 12.0) / 24.0)
        val (eotSeconds, eotRate) = equationOfTime(gamma)
        val longitudeOffsetSeconds = longitude * SECONDS_PER_DEGREE

        val utcSecondsOfDay = hourFrac * 3600.0
        val solarTimeSeconds = wrapSeconds(utcSecondsOfDay + longitudeOffsetSeconds + eotSeconds)

        val latRad = Math.toRadians(latitude)
        val earthRotationMps = EQUATORIAL_ROTATION_MPS * cos(latRad)
        val polarDampened = abs(latitude) > POLAR_WARNING_LATITUDE || abs(earthRotationMps) <= 1.0
        val relativeVelocity = if (polarDampened) 0.0 else eastSpeedMps / earthRotationMps
        val solarVelocity = 1.0 + eotRate + relativeVelocity

        val declination = solarDeclination(gamma)
        val hourAngleRad = Math.toRadians((solarTimeSeconds - SOLAR_NOON_SECONDS) / SECONDS_PER_DEGREE)
        val altitudeDeg = altitude(latRad, declination, hourAngleRad)
        val (sunriseSolar, sunsetSolar, polarDay, polarNight) = sunriseSunset(latRad, declination)

        fun eventUtc(targetSolarSeconds: Double) = utcMillisForSolarSeconds(
            utcMillis, utcSecondsOfDay, targetSolarSeconds, longitudeOffsetSeconds, eotSeconds,
        )

        return SolarData(
            utcMillis = utcMillis,
            solarTimeSeconds = solarTimeSeconds,
            eotSeconds = eotSeconds,
            eotRate = eotRate,
            longitudeOffsetSeconds = longitudeOffsetSeconds,
            solarVelocity = solarVelocity,
            sunAltitudeDeg = altitudeDeg,
            sunriseSolarSeconds = sunriseSolar,
            sunsetSolarSeconds = sunsetSolar,
            solarNoonUtcMillis = eventUtc(SOLAR_NOON_SECONDS),
            sunriseUtcMillis = sunriseSolar?.let(::eventUtc),
            sunsetUtcMillis = sunsetSolar?.let(::eventUtc),
            isPolarDay = polarDay,
            isPolarNight = polarNight,
            isPolarDampened = polarDampened,
        )
    }

    private fun equationOfTime(gamma: Double): Pair<Double, Double> {
        val k = 229.18
        val eotMinutes = k * (
            0.000075 +
                0.001868 * cos(gamma) - 0.032077 * sin(gamma) -
                0.014615 * cos(2.0 * gamma) - 0.040849 * sin(2.0 * gamma)
            )
        // d/dγ of the NOAA/Spencer series; 2γ terms pick up a factor of 2.
        val deotMinutesDGamma = k * (
            -0.001868 * sin(gamma) - 0.032077 * cos(gamma) +
                0.029230 * sin(2.0 * gamma) - 0.081698 * cos(2.0 * gamma)
            )
        val dGammaDt = 2.0 * PI / (365.0 * SECONDS_PER_DAY)
        return eotMinutes * 60.0 to deotMinutesDGamma * dGammaDt * 60.0
    }

    private fun solarDeclination(gamma: Double): Double {
        return 0.006918 -
            0.399912 * cos(gamma) + 0.070257 * sin(gamma) -
            0.006758 * cos(2.0 * gamma) + 0.000907 * sin(2.0 * gamma) -
            0.002697 * cos(3.0 * gamma) + 0.00148 * sin(3.0 * gamma)
    }

    private fun altitude(latRad: Double, declination: Double, hourAngleRad: Double): Double {
        val sinAlt = sin(latRad) * sin(declination) +
            cos(latRad) * cos(declination) * cos(hourAngleRad)
        return Math.toDegrees(asin(sinAlt.coerceIn(-1.0, 1.0)))
    }

    private fun sunriseSunset(
        latRad: Double,
        declination: Double,
    ): SunriseResult {
        val altRef = Math.toRadians(SUNRISE_ALTITUDE_DEG)
        val denom = cos(latRad) * cos(declination)
        if (abs(denom) < 1e-12) {
            val alwaysUp = sin(latRad) * sin(declination) - sin(altRef) > 0
            return SunriseResult(null, null, polarDay = alwaysUp, polarNight = !alwaysUp)
        }
        val cosOmega = (sin(altRef) - sin(latRad) * sin(declination)) / denom
        if (cosOmega < -1.0 || cosOmega > 1.0) {
            return SunriseResult(null, null, polarDay = cosOmega < -1.0, polarNight = cosOmega > 1.0)
        }
        val omegaSeconds = Math.toDegrees(acos(cosOmega.coerceIn(-1.0, 1.0))) * SECONDS_PER_DEGREE
        return SunriseResult(
            sunriseSolarSeconds = wrapSeconds(SOLAR_NOON_SECONDS - omegaSeconds),
            sunsetSolarSeconds = wrapSeconds(SOLAR_NOON_SECONDS + omegaSeconds),
            polarDay = false,
            polarNight = false,
        )
    }

    private data class SunriseResult(
        val sunriseSolarSeconds: Double?,
        val sunsetSolarSeconds: Double?,
        val polarDay: Boolean,
        val polarNight: Boolean,
    )

    companion object {
        private val UTC: TimeZone = TimeZone.getTimeZone("UTC")
        const val SECONDS_PER_DAY = 86_400.0
        const val SECONDS_PER_DEGREE = 240.0
        const val SOLAR_NOON_SECONDS = 43_200.0
        const val EQUATORIAL_ROTATION_MPS = 465.1
        const val POLAR_WARNING_LATITUDE = 85.0
        private const val SUNRISE_ALTITUDE_DEG = -0.833

        fun wrapSeconds(seconds: Double): Double = seconds.mod(SECONDS_PER_DAY)

        fun wrapSignedSeconds(seconds: Double): Double =
            wrapSeconds(seconds + SECONDS_PER_DAY / 2.0) - SECONDS_PER_DAY / 2.0

        private fun utcMillisForSolarSeconds(
            nowUtcMillis: Long,
            nowUtcSecondsOfDay: Double,
            targetSolarSeconds: Double,
            longitudeOffsetSeconds: Double,
            eotSeconds: Double,
        ): Long {
            val targetUtcSeconds = wrapSeconds(targetSolarSeconds - longitudeOffsetSeconds - eotSeconds)
            var delta = targetUtcSeconds - nowUtcSecondsOfDay
            if (delta > SECONDS_PER_DAY / 2.0) delta -= SECONDS_PER_DAY
            if (delta < -SECONDS_PER_DAY / 2.0) delta += SECONDS_PER_DAY
            return nowUtcMillis + (delta * 1000.0).toLong()
        }
    }
}

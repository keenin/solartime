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

import android.app.Application
import android.location.Location
import androidx.annotation.StringRes
import androidx.lifecycle.AndroidViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs
import kotlin.math.sin

class SolarViewModel(application: Application) : AndroidViewModel(application) {

    private val engine = SolarEngine()
    private val timeZone: () -> TimeZone = { TimeZone.getDefault() }

    enum class LocationStatus {
        NEED_PERMISSION,
        PERMISSION_DENIED,
        WAITING_FIX,
        GPS,
        MANUAL,
        UNAVAILABLE,
    }

    data class UiState(
        val regularTimeText: String,
        val solarTimeText: String,
        val solarVelocityText: String,
        val eotText: String,
        val civilOffsetText: String,
        val locationText: String,
        val sunTimesText: String,
        val engineStatusText: String,
        val showEngineStatus: Boolean,
        val polar: Boolean,
        val locationStatus: LocationStatus,
        val showManualEntry: Boolean,
        val showPermissionBanner: Boolean,
        val showUseGps: Boolean,
        val trackGps: Boolean,
        val fineGranted: Boolean,
        val coarseGranted: Boolean,
        val gpsIntervalMillis: Long,
        val sunAltitudeDeg: Double,
        val sunAzimuthDeg: Double,
        val solarTimeFraction: Float,
        val sunriseFraction: Float?,
        val sunsetFraction: Float?,
        val polarDay: Boolean,
        val polarNight: Boolean,
        val locationContentDescription: String,
        val solarClockContentDescription: String,
        val sunArcContentDescription: String,
    )

    private data class LocationSnapshot(
        val latitude: Double = 0.0,
        val longitude: Double = 0.0,
        val eastSpeedMps: Double = 0.0,
        val speedMps: Float = 0f,
        val accuracyM: Float? = null,
        val hasFix: Boolean = false,
        val source: LocationStatus = LocationStatus.WAITING_FIX,
    )

    private val snapshot = AtomicReference(LocationSnapshot())
    private val lastGps = AtomicReference<LocationSnapshot?>(null)
    private val fineGranted = AtomicBoolean(false)
    private val coarseGranted = AtomicBoolean(false)
    private val permissionDenied = AtomicBoolean(false)
    private val providerUnavailable = AtomicBoolean(false)
    private val showDebug = AtomicBoolean(false)
    private val requestedPermission = AtomicBoolean(false)
    private val manualEditorOpen = AtomicBoolean(false)

    fun hasRequestedPermission(): Boolean = requestedPermission.get()

    fun markPermissionRequested() {
        requestedPermission.set(true)
    }

    fun setPermission(fine: Boolean, coarse: Boolean) {
        fineGranted.set(fine)
        coarseGranted.set(coarse)
        if (fine || coarse) {
            permissionDenied.set(false)
        }
    }

    fun onPermissionDenied() {
        permissionDenied.set(true)
        fineGranted.set(false)
        coarseGranted.set(false)
        requestedPermission.set(true)
        manualEditorOpen.set(true)
        val current = snapshot.get()
        if (current.source != LocationStatus.MANUAL) {
            snapshot.set(current.copy(source = LocationStatus.PERMISSION_DENIED, hasFix = false))
        }
    }

    fun onProviderUnavailable() {
        providerUnavailable.set(true)
        manualEditorOpen.set(true)
        val current = snapshot.get()
        if (current.source != LocationStatus.MANUAL) {
            snapshot.set(current.copy(source = LocationStatus.UNAVAILABLE, hasFix = current.hasFix))
        }
    }

    fun onGpsLocation(location: Location) {
        val east = if (location.hasSpeed() && location.hasBearing()) {
            location.speed * sin(Math.toRadians(location.bearing.toDouble()))
        } else {
            0.0
        }
        val gpsSnap = LocationSnapshot(
            latitude = location.latitude,
            longitude = location.longitude,
            eastSpeedMps = east,
            speedMps = if (location.hasSpeed()) location.speed else 0f,
            accuracyM = if (location.hasAccuracy()) location.accuracy else null,
            hasFix = true,
            source = LocationStatus.GPS,
        )
        lastGps.set(gpsSnap)
        if (snapshot.get().source == LocationStatus.MANUAL) return
        providerUnavailable.set(false)
        snapshot.set(gpsSnap)
    }

    fun onManualLocation(latitude: Double, longitude: Double): Boolean {
        if (latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return false
        snapshot.set(
            LocationSnapshot(
                latitude = latitude,
                longitude = longitude,
                eastSpeedMps = 0.0,
                speedMps = 0f,
                accuracyM = null,
                hasFix = true,
                source = LocationStatus.MANUAL,
            ),
        )
        manualEditorOpen.set(true)
        return true
    }

    fun useGps() {
        snapshot.set(lastGps.get() ?: LocationSnapshot(source = LocationStatus.WAITING_FIX))
        manualEditorOpen.set(false)
    }

    fun toggleManualEditor() {
        if (snapshot.get().source == LocationStatus.MANUAL) {
            manualEditorOpen.set(true)
            return
        }
        manualEditorOpen.set(!manualEditorOpen.get())
    }

    fun toggleDebug() {
        showDebug.set(!showDebug.get())
    }

    fun uiStates(): Flow<UiState> = flow {
        while (true) {
            emit(render(System.currentTimeMillis()))
            delay(UI_PERIOD_MS)
        }
    }

    private fun render(now: Long): UiState {
        val loc = snapshot.get()
        val fine = fineGranted.get()
        val coarse = coarseGranted.get()
        val denied = permissionDenied.get()
        val unavailable = providerUnavailable.get()
        val gpsAllowed = fine || coarse
        val status = when {
            loc.source == LocationStatus.MANUAL -> LocationStatus.MANUAL
            !gpsAllowed && denied -> LocationStatus.PERMISSION_DENIED
            !gpsAllowed -> LocationStatus.NEED_PERMISSION
            unavailable && !loc.hasFix -> LocationStatus.UNAVAILABLE
            loc.hasFix -> LocationStatus.GPS
            else -> LocationStatus.WAITING_FIX
        }
        val trackGps = gpsAllowed && loc.source != LocationStatus.MANUAL
        val showManual = loc.source == LocationStatus.MANUAL ||
            status == LocationStatus.PERMISSION_DENIED ||
            status == LocationStatus.UNAVAILABLE ||
            manualEditorOpen.get()
        val tz = timeZone()
        val regularTimeText = formatLocalTime(now, tz, tenths = true)

        if (!loc.hasFix) {
            val locationText = locationMessage(status)
            return UiState(
                regularTimeText = regularTimeText,
                solarTimeText = str(R.string.solar_clock_placeholder),
                solarVelocityText = "",
                eotText = "",
                civilOffsetText = "",
                locationText = locationText,
                sunTimesText = "",
                engineStatusText = str(R.string.engine_waiting),
                showEngineStatus = showDebug.get(),
                polar = false,
                locationStatus = status,
                showManualEntry = showManual,
                showPermissionBanner = status == LocationStatus.PERMISSION_DENIED ||
                    status == LocationStatus.NEED_PERMISSION,
                showUseGps = gpsAllowed && loc.source == LocationStatus.MANUAL,
                trackGps = trackGps,
                fineGranted = fine,
                coarseGranted = coarse,
                gpsIntervalMillis = gpsIntervalMillis(loc.speedMps),
                sunAltitudeDeg = 0.0,
                sunAzimuthDeg = 180.0,
                solarTimeFraction = 0.5f,
                sunriseFraction = null,
                sunsetFraction = null,
                polarDay = false,
                polarNight = false,
                locationContentDescription = locationText,
                solarClockContentDescription = str(R.string.solar_time_unavailable),
                sunArcContentDescription = "",
            )
        }

        val data = engine.calculate(loc.latitude, loc.longitude, loc.eastSpeedMps, now)
        val localSeconds = localSecondsOfDay(now, tz)
        val civilDiff = SolarEngine.wrapSignedSeconds(localSeconds - data.solarTimeSeconds)
        val debugHz = 1000.0 / UI_PERIOD_MS
        val gpsHz = 1000.0 / gpsIntervalMillis(loc.speedMps)
        val solarText = formatHms(data.solarTimeSeconds, tenths = true)

        return UiState(
            regularTimeText = regularTimeText,
            solarTimeText = solarText,
            solarVelocityText = str(R.string.solar_velocity, data.solarVelocity),
            eotText = str(R.string.equation_of_time, data.eotSeconds / 60.0),
            civilOffsetText = civilOffsetMessage(civilDiff),
            locationText = locationFixText(loc),
            sunTimesText = sunTimesText(data, tz),
            engineStatusText = str(R.string.engine_status, debugHz, gpsHz),
            showEngineStatus = showDebug.get(),
            polar = data.isPolarDampened,
            locationStatus = status,
            showManualEntry = showManual,
            showPermissionBanner = status == LocationStatus.PERMISSION_DENIED,
            showUseGps = gpsAllowed,
            trackGps = trackGps,
            fineGranted = fine,
            coarseGranted = coarse,
            gpsIntervalMillis = gpsIntervalMillis(loc.speedMps),
            sunAltitudeDeg = data.sunAltitudeDeg,
            sunAzimuthDeg = data.sunAzimuthDeg,
            solarTimeFraction = (data.solarTimeSeconds / SolarEngine.SECONDS_PER_DAY).toFloat(),
            sunriseFraction = data.sunriseSolarSeconds?.div(SolarEngine.SECONDS_PER_DAY)?.toFloat(),
            sunsetFraction = data.sunsetSolarSeconds?.div(SolarEngine.SECONDS_PER_DAY)?.toFloat(),
            polarDay = data.isPolarDay,
            polarNight = data.isPolarNight,
            locationContentDescription = locationFixText(loc),
            solarClockContentDescription = str(
                R.string.solar_time_cd,
                formatHms(data.solarTimeSeconds, tenths = false),
            ),
            sunArcContentDescription = str(R.string.sun_arc_cd, data.sunAltitudeDeg),
        )
    }

    private fun locationMessage(status: LocationStatus): String = when (status) {
        LocationStatus.NEED_PERMISSION,
        LocationStatus.PERMISSION_DENIED,
        -> str(R.string.location_permission_needed)
        LocationStatus.UNAVAILABLE -> str(R.string.location_unavailable)
        LocationStatus.WAITING_FIX -> str(R.string.location_waiting)
        LocationStatus.GPS, LocationStatus.MANUAL -> ""
    }

    private fun locationFixText(loc: LocationSnapshot): String {
        val lat = str(
            R.string.coord_lat,
            abs(loc.latitude),
            str(if (loc.latitude >= 0) R.string.hemisphere_n else R.string.hemisphere_s),
        )
        val lon = str(
            R.string.coord_lon,
            abs(loc.longitude),
            str(if (loc.longitude >= 0) R.string.hemisphere_e else R.string.hemisphere_w),
        )
        return when {
            loc.source == LocationStatus.MANUAL -> str(R.string.location_manual, lat, lon)
            loc.accuracyM != null -> str(R.string.location_fix, lat, lon, loc.accuracyM)
            else -> str(R.string.location_fix_no_accuracy, lat, lon)
        }
    }

    private fun civilOffsetMessage(diffSeconds: Double): String {
        if (abs(diffSeconds) < 30.0) return str(R.string.civil_matches)
        val amount = formatDuration(abs(diffSeconds))
        return if (diffSeconds > 0) {
            str(R.string.civil_ahead, amount)
        } else {
            str(R.string.civil_behind, amount)
        }
    }

    private fun formatDuration(seconds: Double): String {
        val total = seconds.toInt()
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return when {
            h > 0 && m > 0 -> str(R.string.duration_h_m, h, m)
            h > 0 -> str(R.string.duration_h, h)
            m > 0 -> str(R.string.duration_m, m)
            else -> str(R.string.duration_s, s)
        }
    }

    private fun sunTimesText(data: SolarEngine.SolarData, tz: TimeZone): String {
        val noon = formatLocalHm(data.solarNoonUtcMillis, tz)
        return when {
            data.isPolarDay -> str(R.string.sun_polar_day, noon)
            data.isPolarNight -> str(R.string.sun_polar_night)
            data.sunriseUtcMillis != null && data.sunsetUtcMillis != null -> str(
                R.string.sun_times,
                formatLocalHm(data.sunriseUtcMillis, tz),
                noon,
                formatLocalHm(data.sunsetUtcMillis, tz),
            )
            else -> str(R.string.sun_noon_only, noon)
        }
    }

    private fun formatLocalTime(utcMillis: Long, tz: TimeZone, tenths: Boolean): String {
        val calendar = Calendar.getInstance(tz).apply { timeInMillis = utcMillis }
        val h = calendar.get(Calendar.HOUR_OF_DAY)
        val m = calendar.get(Calendar.MINUTE)
        val s = calendar.get(Calendar.SECOND)
        val ds = calendar.get(Calendar.MILLISECOND) / 100
        return if (tenths) {
            String.format(Locale.US, "%02d:%02d:%02d.%d", h, m, s, ds)
        } else {
            String.format(Locale.US, "%02d:%02d:%02d", h, m, s)
        }
    }

    private fun formatLocalHm(utcMillis: Long, tz: TimeZone): String {
        val calendar = Calendar.getInstance(tz).apply { timeInMillis = utcMillis }
        return String.format(
            Locale.US,
            "%02d:%02d",
            calendar.get(Calendar.HOUR_OF_DAY),
            calendar.get(Calendar.MINUTE),
        )
    }

    private fun formatHms(seconds: Double, tenths: Boolean): String {
        val wrapped = SolarEngine.wrapSeconds(seconds)
        val totalTenths = (wrapped * 10.0).toInt().coerceIn(0, 863_999)
        val h = totalTenths / 36_000
        val m = (totalTenths / 600) % 60
        val s = (totalTenths / 10) % 60
        val t = totalTenths % 10
        return if (tenths) {
            String.format(Locale.US, "%02d:%02d:%02d.%d", h, m, s, t)
        } else {
            String.format(Locale.US, "%02d:%02d:%02d", h, m, s)
        }
    }

    private fun localSecondsOfDay(utcMillis: Long, tz: TimeZone): Double {
        val calendar = Calendar.getInstance(tz).apply { timeInMillis = utcMillis }
        return calendar.get(Calendar.HOUR_OF_DAY) * 3600.0 +
            calendar.get(Calendar.MINUTE) * 60.0 +
            calendar.get(Calendar.SECOND) +
            calendar.get(Calendar.MILLISECOND) / 1000.0
    }

    private fun str(@StringRes id: Int, vararg args: Any): String {
        return if (args.isEmpty()) {
            getApplication<Application>().getString(id)
        } else {
            getApplication<Application>().getString(id, *args)
        }
    }

    companion object {
        const val UI_PERIOD_MS = 100L

        fun gpsIntervalMillis(speedMps: Float): Long = when {
            speedMps < 1f -> 2000L
            speedMps < 15f -> 500L
            speedMps < 40f -> 200L
            else -> 100L
        }
    }
}

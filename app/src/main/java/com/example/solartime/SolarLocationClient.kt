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

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class SolarLocationClient(
    context: Context,
    private val onLocation: (Location) -> Unit,
    private val onUnavailable: () -> Unit,
) {
    private val appContext = context.applicationContext
    private val fused = LocationServices.getFusedLocationProviderClient(appContext)
    private val locationManager =
        appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private var started = false

    private val fusedCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(onLocation)
        }
    }

    private val managerListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            onLocation(location)
        }

        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

        override fun onProviderEnabled(provider: String) = Unit

        override fun onProviderDisabled(provider: String) = Unit
    }

    @SuppressLint("MissingPermission")
    fun start(intervalMs: Long, fineGranted: Boolean, coarseGranted: Boolean) {
        stop()
        if (!fineGranted && !coarseGranted) return

        val play = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(appContext)
        if (play == ConnectionResult.SUCCESS) {
            started = true
            val priority = if (fineGranted) {
                Priority.PRIORITY_HIGH_ACCURACY
            } else {
                Priority.PRIORITY_BALANCED_POWER_ACCURACY
            }
            val request = LocationRequest.Builder(priority, intervalMs)
                .setMinUpdateIntervalMillis((intervalMs / 2).coerceAtLeast(100L))
                .setWaitForAccurateLocation(false)
                .build()
            try {
                fused.lastLocation.addOnSuccessListener { location ->
                    location?.let(onLocation)
                }
                fused.requestLocationUpdates(request, fusedCallback, Looper.getMainLooper())
            } catch (_: Exception) {
                startManager(intervalMs, fineGranted, coarseGranted)
            }
        } else {
            startManager(intervalMs, fineGranted, coarseGranted)
        }
    }

    @SuppressLint("MissingPermission")
    private fun startManager(intervalMs: Long, fineGranted: Boolean, coarseGranted: Boolean) {
        val provider = pickProvider(fineGranted, coarseGranted)
        if (provider == null) {
            started = false
            onUnavailable()
            return
        }
        started = true
        try {
            locationManager.getLastKnownLocation(provider)?.let(onLocation)
            locationManager.requestLocationUpdates(
                provider,
                intervalMs,
                0f,
                managerListener,
                Looper.getMainLooper(),
            )
        } catch (_: Exception) {
            started = false
            onUnavailable()
        }
    }

    private fun pickProvider(fineGranted: Boolean, coarseGranted: Boolean): String? {
        val enabled = locationManager.getProviders(true)
        return when {
            fineGranted && enabled.contains(LocationManager.GPS_PROVIDER) ->
                LocationManager.GPS_PROVIDER
            (fineGranted || coarseGranted) && enabled.contains(LocationManager.NETWORK_PROVIDER) ->
                LocationManager.NETWORK_PROVIDER
            (fineGranted || coarseGranted) && enabled.contains(LocationManager.PASSIVE_PROVIDER) ->
                LocationManager.PASSIVE_PROVIDER
            else -> null
        }
    }

    fun stop() {
        if (!started) return
        started = false
        try {
            fused.removeLocationUpdates(fusedCallback)
        } catch (_: Exception) {
            // Fused client may not have been used.
        }
        try {
            locationManager.removeUpdates(managerListener)
        } catch (_: Exception) {
            // Listener may not have been registered.
        }
    }
}

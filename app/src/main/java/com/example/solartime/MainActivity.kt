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

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.example.solartime.databinding.ActivityMainBinding
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val viewModel: SolarViewModel by viewModels()
    private var locationClient: SolarLocationClient? = null
    private var runningGpsInterval: Long = -1L
    private var polarWarningAnimator: ObjectAnimator? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val fine = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val coarse = grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (fine || coarse) {
            viewModel.setPermission(fine, coarse)
        } else {
            viewModel.onPermissionDenied()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        locationClient = SolarLocationClient(
            context = this,
            onLocation = viewModel::onGpsLocation,
            onUnavailable = viewModel::onProviderUnavailable,
        )

        binding.tvSolarClock.setOnLongClickListener {
            viewModel.toggleDebug()
            true
        }
        binding.tvLocation.setOnClickListener {
            viewModel.toggleManualEditor()
        }
        binding.tvPermissionBanner.setOnClickListener {
            requestLocationPermission()
        }
        binding.btnApplyLocation.setOnClickListener { applyManualLocation() }
        binding.btnUseGps.setOnClickListener {
            viewModel.useGps()
            runningGpsInterval = -1L
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                syncPermission()
                viewModel.uiStates().collect { ui ->
                    bind(ui)
                    syncLocationUpdates(ui)
                }
            }
        }
    }

    override fun onStop() {
        locationClient?.stop()
        runningGpsInterval = -1L
        super.onStop()
    }

    override fun onDestroy() {
        polarWarningAnimator?.cancel()
        locationClient?.stop()
        super.onDestroy()
    }

    private fun syncPermission() {
        val fine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (fine || coarse) {
            viewModel.setPermission(fine, coarse)
            return
        }
        if (!viewModel.hasRequestedPermission()) {
            requestLocationPermission()
        } else {
            viewModel.onPermissionDenied()
        }
    }

    private fun requestLocationPermission() {
        viewModel.markPermissionRequested()
        permissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    }

    private fun syncLocationUpdates(ui: SolarViewModel.UiState) {
        if (!ui.trackGps) {
            locationClient?.stop()
            runningGpsInterval = -1L
            return
        }
        if (runningGpsInterval == ui.gpsIntervalMillis) return
        runningGpsInterval = ui.gpsIntervalMillis
        locationClient?.start(ui.gpsIntervalMillis, ui.fineGranted, ui.coarseGranted)
    }

    private fun bind(ui: SolarViewModel.UiState) {
        binding.tvRegularTime.text = ui.regularTimeText
        binding.tvSolarClock.text = ui.solarTimeText
        binding.tvSolarClock.contentDescription = ui.solarClockContentDescription
        binding.tvWarpMultiplier.text = ui.solarVelocityText
        binding.tvTimeOdometer.text = ui.eotText
        binding.tvCivilOffset.text = ui.civilOffsetText
        binding.tvLocation.text = ui.locationText
        binding.tvLocation.contentDescription = ui.locationContentDescription
        binding.tvSunTimes.text = ui.sunTimesText
        binding.tvEngineStatus.text = ui.engineStatusText
        binding.tvEngineStatus.isVisible = ui.showEngineStatus
        binding.tvPermissionBanner.isVisible = ui.showPermissionBanner
        binding.manualLocationGroup.isVisible = ui.showManualEntry
        binding.btnUseGps.isVisible = ui.showUseGps
        binding.sunArc.isVisible = ui.locationStatus == SolarViewModel.LocationStatus.GPS ||
            ui.locationStatus == SolarViewModel.LocationStatus.MANUAL
        if (binding.sunArc.isVisible) {
            binding.sunArc.bind(
                solarTimeFraction = ui.solarTimeFraction,
                sunriseFraction = ui.sunriseFraction,
                sunsetFraction = ui.sunsetFraction,
                polarDay = ui.polarDay,
                polarNight = ui.polarNight,
                sunAltitudeDeg = ui.sunAltitudeDeg,
                contentDescription = ui.sunArcContentDescription,
            )
        }
        updatePolarWarning(ui.polar)
    }

    private fun applyManualLocation() {
        val lat = binding.etLatitude.text?.toString()?.toDoubleOrNull()
        val lon = binding.etLongitude.text?.toString()?.toDoubleOrNull()
        if (lat == null || lon == null || !viewModel.onManualLocation(lat, lon)) {
            Toast.makeText(this, R.string.manual_location_invalid, Toast.LENGTH_SHORT).show()
            return
        }
        runningGpsInterval = -1L
        locationClient?.stop()
    }

    private fun updatePolarWarning(isPolar: Boolean) {
        if (isPolar) {
            if (binding.tvPolarWarning.visibility != View.VISIBLE) {
                binding.tvPolarWarning.visibility = View.VISIBLE
                polarWarningAnimator?.cancel()
                polarWarningAnimator = ObjectAnimator.ofFloat(
                    binding.tvPolarWarning,
                    View.ALPHA,
                    1f,
                    0.2f,
                ).apply {
                    duration = 600
                    repeatMode = ValueAnimator.REVERSE
                    repeatCount = ValueAnimator.INFINITE
                    start()
                }
            }
        } else if (binding.tvPolarWarning.visibility != View.GONE) {
            binding.tvPolarWarning.visibility = View.GONE
            polarWarningAnimator?.cancel()
            polarWarningAnimator = null
            binding.tvPolarWarning.alpha = 1f
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(this, permission) ==
            PackageManager.PERMISSION_GRANTED
    }
}

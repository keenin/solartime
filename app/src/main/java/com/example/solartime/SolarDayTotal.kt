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

import java.io.BufferedReader
import java.io.BufferedWriter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

/**
 * Sliding 24-hour total of how much movement has lengthened (positive)
 * or shortened (negative) the solar day.
 *
 * The civil-minus-solar offset, holding timezone fixed, moves with
 * longitude: 240 solar seconds per degree. The running total is the
 * change in that offset over the past [windowMillis], so westward
 * travel yields a positive value (a longer solar day).
 */
class SolarDayTotal(
    private val windowMillis: Long = WINDOW_MILLIS,
    private val minSampleIntervalMillis: Long = SAMPLE_INTERVAL_MILLIS,
) {
    data class Sample(val timeMillis: Long, val longitudeOffsetSeconds: Double)

    private val samples = ArrayDeque<Sample>()

    val sampleCount: Int get() = samples.size

    fun record(timeMillis: Long, longitudeOffsetSeconds: Double) {
        val last = samples.lastOrNull()
        if (last != null) {
            if (timeMillis < last.timeMillis) return
            if (timeMillis - last.timeMillis < minSampleIntervalMillis) return
        }
        samples.addLast(Sample(timeMillis, longitudeOffsetSeconds))
        evict(timeMillis)
    }

    /**
     * Seconds the civil-minus-solar offset has changed over the window.
     * Positive lengthens the solar day (westbound); negative shortens it.
     */
    fun totalSeconds(timeMillis: Long, currentLongitudeOffsetSeconds: Double): Double {
        evict(timeMillis)
        val start = samples.firstOrNull() ?: return 0.0
        return SolarEngine.wrapSignedSeconds(
            start.longitudeOffsetSeconds - currentLongitudeOffsetSeconds,
        )
    }

    fun snapshot(): List<Sample> = samples.toList()

    fun writeTo(writer: BufferedWriter) {
        writer.write(FILE_VERSION)
        writer.newLine()
        for (sample in samples) {
            writer.write(
                String.format(Locale.US, "%d,%.6f", sample.timeMillis, sample.longitudeOffsetSeconds),
            )
            writer.newLine()
        }
    }

    fun readFrom(reader: BufferedReader) {
        samples.clear()
        val version = reader.readLine() ?: return
        if (version != FILE_VERSION) return
        var lastTime = Long.MIN_VALUE
        while (true) {
            val line = reader.readLine() ?: break
            val comma = line.indexOf(',')
            if (comma <= 0) continue
            val time = line.substring(0, comma).toLongOrNull() ?: continue
            val offset = line.substring(comma + 1).toDoubleOrNull() ?: continue
            if (time < lastTime) continue
            samples.addLast(Sample(time, offset))
            lastTime = time
        }
    }

    private fun evict(nowMillis: Long) {
        val cutoff = nowMillis - windowMillis
        while (samples.size >= 2) {
            val second = samples.elementAt(1)
            if (second.timeMillis <= cutoff) {
                samples.removeFirst()
            } else {
                break
            }
        }
    }

    companion object {
        const val WINDOW_MILLIS = 24L * 60L * 60L * 1000L
        const val SAMPLE_INTERVAL_MILLIS = 1_000L
        private const val FILE_VERSION = "v1"

        fun formatSignedMinSec(seconds: Double): String {
            val rounded = roundAwayFromZero(seconds)
            val (hours, minutes, secs) = absHms(rounded)
            val sign = if (rounded < 0L) "-" else "+"
            return if (hours > 0L) {
                String.format(Locale.US, "%s%d h %d min %02d sec", sign, hours, minutes, secs)
            } else {
                String.format(Locale.US, "%s%d min %02d sec", sign, minutes, secs)
            }
        }

        fun formatUnsignedMinSec(seconds: Double): String {
            val (hours, minutes, secs) = absHms(roundAwayFromZero(seconds))
            return when {
                hours > 0L -> String.format(Locale.US, "%d h %d min %02d sec", hours, minutes, secs)
                minutes > 0L -> String.format(Locale.US, "%d min %02d sec", minutes, secs)
                else -> String.format(Locale.US, "%d sec", secs)
            }
        }

        private fun absHms(rounded: Long): Triple<Long, Long, Long> {
            val remaining = abs(rounded)
            return Triple(remaining / 3600L, (remaining % 3600L) / 60L, remaining % 60L)
        }

        private fun roundAwayFromZero(seconds: Double): Long {
            val absRounded = floor(abs(seconds) + 0.5).toLong()
            return if (seconds < 0.0) -absRounded else absRounded
        }
    }
}

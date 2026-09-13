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

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

class SunArcView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0,
) : View(context, attrs, defStyleAttr) {

    private fun paint(style: Paint.Style, color: Int, cap: Paint.Cap? = null) =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.style = style
            this.color = color
            if (cap != null) strokeCap = cap
        }

    private val nightPaint = paint(Paint.Style.STROKE, 0xFF2A2A2A.toInt(), Paint.Cap.ROUND)
    private val dayPaint = paint(Paint.Style.STROKE, 0xFFFFB300.toInt(), Paint.Cap.ROUND)
    private val horizonPaint = paint(Paint.Style.STROKE, 0xFF555555.toInt())
    private val sunPaint = paint(Paint.Style.FILL, 0xFFFFD54F.toInt())
    private val sunNightPaint = paint(Paint.Style.FILL, 0x66FFD54F)
    private val glowPaint = paint(Paint.Style.FILL, 0x33FFB300)
    private val arcRect = RectF()

    private var solarTimeFraction = 0.5f
    private var sunriseFraction: Float? = 0.25f
    private var sunsetFraction: Float? = 0.75f
    private var polarDay = false
    private var polarNight = false
    private var sunAltitudeDeg = 0.0

    fun bind(
        solarTimeFraction: Float,
        sunriseFraction: Float?,
        sunsetFraction: Float?,
        polarDay: Boolean,
        polarNight: Boolean,
        sunAltitudeDeg: Double,
        contentDescription: String,
    ) {
        this.solarTimeFraction = solarTimeFraction
        this.sunriseFraction = sunriseFraction
        this.sunsetFraction = sunsetFraction
        this.polarDay = polarDay
        this.polarNight = polarNight
        this.sunAltitudeDeg = sunAltitudeDeg
        this.contentDescription = contentDescription
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val minHeight = (180 * resources.displayMetrics.density).toInt()
        val height = when (MeasureSpec.getMode(heightMeasureSpec)) {
            MeasureSpec.EXACTLY -> MeasureSpec.getSize(heightMeasureSpec)
            MeasureSpec.AT_MOST -> min(minHeight, MeasureSpec.getSize(heightMeasureSpec))
            else -> minHeight
        }
        setMeasuredDimension(width, height)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density
        val stroke = 6f * density
        nightPaint.strokeWidth = stroke
        dayPaint.strokeWidth = stroke
        horizonPaint.strokeWidth = 1.5f * density

        val pad = stroke + 16f * density
        val size = min(width - pad * 2f, height - pad * 2f)
        val cx = width / 2f
        val cy = height / 2f
        val radius = size / 2f
        arcRect.set(cx - radius, cy - radius, cx + radius, cy + radius)

        canvas.drawCircle(cx, cy, radius, nightPaint)
        canvas.drawLine(cx - radius, cy, cx + radius, cy, horizonPaint)

        if (polarDay) {
            canvas.drawCircle(cx, cy, radius, dayPaint)
        } else if (!polarNight) {
            val rise = sunriseFraction
            val set = sunsetFraction
            if (rise != null && set != null) {
                val start = androidAngle(rise)
                var sweep = (set - rise) * 360f
                if (sweep < 0f) sweep += 360f
                canvas.drawArc(arcRect, start, sweep, false, dayPaint)
            }
        }

        val angleRad = Math.toRadians(androidAngle(solarTimeFraction).toDouble())
        val sunX = cx + radius * cos(angleRad).toFloat()
        val sunY = cy + radius * sin(angleRad).toFloat()
        val sunRadius = 10f * density
        val above = sunAltitudeDeg > -0.833 || polarDay
        if (above) {
            canvas.drawCircle(sunX, sunY, sunRadius * 2.2f, glowPaint)
            canvas.drawCircle(sunX, sunY, sunRadius, sunPaint)
        } else {
            canvas.drawCircle(sunX, sunY, sunRadius * 0.8f, sunNightPaint)
        }
    }

    /**
     * Map a 0–1 fraction of a solar day to Android canvas degrees.
     * Midnight is at the bottom, 06:00 left, noon top, 18:00 right.
     * Android 0° is 3 o'clock, clockwise.
     */
    private fun androidAngle(fraction: Float): Float = 90f + fraction * 360f
}

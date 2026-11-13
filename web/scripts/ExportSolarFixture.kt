/*
 * Copyright (C) 2026 Keenin Krehbiel
 *
 * THIS FILE WAS WRITTEN ENTIRELY BY ARTIFICIAL INTELLIGENCE (Grok, xAI).
 * No human authored this source code.
 *
 * SPDX-License-Identifier: GPL-2.0-only
 */

package com.example.solartime

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Prints a JSON fixture of [SolarEngine.calculate] for the web parity tests.
 *
 * Compile against the Android sources (no Android SDK required):
 *
 * kotlinc app/src/main/java/com/example/solartime/SolarEngine.kt \
 *   web/scripts/ExportSolarFixture.kt -include-runtime -d /tmp/solar-fixture.jar
 * java -jar /tmp/solar-fixture.jar > web/test/fixtures/kotlin-solar.json
 */
fun main() {
    val engine = SolarEngine(clock = { error("pass utcMillis explicitly") })
    val cases = listOf(
        Case("equinox-equator", 2024, 3, 20, 12, 0, 0, 0, 0.0, 0.0, 0.0),
        Case("equinox-15e", 2024, 3, 20, 12, 0, 0, 0, 0.0, 15.0, 0.0),
        Case("equinox-eastbound", 2024, 3, 20, 12, 0, 0, 0, 0.0, 0.0, 46.51),
        Case("june-north-pole", 2024, 6, 21, 12, 0, 0, 0, 90.0, 0.0, 30.0),
        Case("december-south-pole", 2024, 12, 21, 12, 0, 0, 0, -90.0, 10.0, 0.0),
        Case("june-greenwich", 2024, 6, 21, 0, 0, 0, 0, 51.4778, -0.0015, 0.0),
        Case("sydney-moving-east", 2024, 1, 15, 3, 45, 30, 500, -33.8688, 151.2093, 20.0),
        Case("reykjavik-year-end", 2023, 12, 31, 23, 59, 59, 999, 64.1466, -21.9426, -10.0),
        Case("date-line-lat-85", 2024, 9, 22, 6, 30, 0, 0, 85.0, 179.9, 5.0),
        Case("date-line-lat-85-1", 2024, 9, 22, 6, 30, 0, 0, 85.1, 179.9, 5.0),
        Case("leap-day-mexico-city", 2024, 2, 29, 12, 0, 0, 0, 19.4326, -99.1332, 0.0),
        Case("sf-with-millis", 2026, 11, 11, 18, 20, 0, 123, 37.7749, -122.4194, 0.0),
    )
    val json = buildString {
        append("{\n")
        append("  \"generator\": \"SolarEngine.kt via web/scripts/ExportSolarFixture.kt\",\n")
        append("  \"cases\": [\n")
        cases.forEachIndexed { index, case ->
            val millis = utcMillis(case.year, case.month, case.day, case.hour, case.minute, case.second, case.millis)
            val data = engine.calculate(case.latitude, case.longitude, case.eastSpeedMps, millis)
            append("    {\n")
            append("      \"name\": ${case.name.jsonString()},\n")
            append("      \"year\": ${case.year},\n")
            append("      \"month\": ${case.month},\n")
            append("      \"day\": ${case.day},\n")
            append("      \"hour\": ${case.hour},\n")
            append("      \"minute\": ${case.minute},\n")
            append("      \"second\": ${case.second},\n")
            append("      \"millisecond\": ${case.millis},\n")
            append("      \"utcMillis\": $millis,\n")
            append("      \"latitude\": ${case.latitude.jsonNumber()},\n")
            append("      \"longitude\": ${case.longitude.jsonNumber()},\n")
            append("      \"eastSpeedMps\": ${case.eastSpeedMps.jsonNumber()},\n")
            append("      \"solarTimeSeconds\": ${data.solarTimeSeconds.jsonNumber()},\n")
            append("      \"eotSeconds\": ${data.eotSeconds.jsonNumber()},\n")
            append("      \"eotRate\": ${data.eotRate.jsonNumber()},\n")
            append("      \"longitudeOffsetSeconds\": ${data.longitudeOffsetSeconds.jsonNumber()},\n")
            append("      \"solarVelocity\": ${data.solarVelocity.jsonNumber()},\n")
            append("      \"sunAltitudeDeg\": ${data.sunAltitudeDeg.jsonNumber()},\n")
            append("      \"sunriseSolarSeconds\": ${data.sunriseSolarSeconds.jsonNumberOrNull()},\n")
            append("      \"sunsetSolarSeconds\": ${data.sunsetSolarSeconds.jsonNumberOrNull()},\n")
            append("      \"solarNoonUtcMillis\": ${data.solarNoonUtcMillis},\n")
            append("      \"sunriseUtcMillis\": ${data.sunriseUtcMillis.jsonLongOrNull()},\n")
            append("      \"sunsetUtcMillis\": ${data.sunsetUtcMillis.jsonLongOrNull()},\n")
            append("      \"isPolarDay\": ${data.isPolarDay},\n")
            append("      \"isPolarNight\": ${data.isPolarNight},\n")
            append("      \"isPolarDampened\": ${data.isPolarDampened}\n")
            append("    }")
            if (index != cases.lastIndex) append(",")
            append("\n")
        }
        append("  ]\n")
        append("}\n")
    }
    print(json)
}

private data class Case(
    val name: String,
    val year: Int,
    val month: Int,
    val day: Int,
    val hour: Int,
    val minute: Int,
    val second: Int,
    val millis: Int,
    val latitude: Double,
    val longitude: Double,
    val eastSpeedMps: Double,
)

private fun utcMillis(
    year: Int,
    month: Int,
    day: Int,
    hour: Int,
    minute: Int,
    second: Int,
    millis: Int,
): Long {
    val calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    calendar.clear()
    calendar.set(year, month - 1, day, hour, minute, second)
    calendar.set(Calendar.MILLISECOND, millis)
    return calendar.timeInMillis
}

private fun String.jsonString(): String = "\"" + this + "\""

private fun Double.jsonNumber(): String = String.format(Locale.US, "%.16g", this)

private fun Double?.jsonNumberOrNull(): String = this?.jsonNumber() ?: "null"

private fun Long?.jsonLongOrNull(): String = this?.toString() ?: "null"

# Solar Time

> **This project was completely written by artificial intelligence.**
>
> Every line of application source, layout XML, tests, Gradle
> configuration, and documentation in this repository was generated
> by **Grok (xAI)**. No human authored the source code. A human
> requested the program and published this repository.
>
> See [NOTICE](NOTICE) for the full authorship statement.

An Android app that displays **apparent solar time** (true solar time)
for your location: civil clock time adjusted for longitude and the
Equation of Time, with a live solar-velocity factor as you move east
or west.

## License

**GNU General Public License version 2 only (GPL-2.0-only)** — the
same license as the [Linux kernel](https://www.kernel.org/).

This is GPLv2 *only*, not “GPLv2 or later.” See [LICENSE](LICENSE)
and [NOTICE](NOTICE).

## What it does

- Shows apparent solar time to a tenth of a second
- Shows how far civil time is ahead of or behind the sun
- Computes Equation of Time (Spencer Fourier form), solar noon,
  sunrise, and sunset
- Uses GPS (Fused Location Provider) or a manually entered latitude
  and longitude
- Scales the location refresh rate with east–west speed to save
  battery
- Dampens the east–west solar-velocity term near the poles, where
  Earth rotation is negligible

## Building

Requirements: Android Studio (or the Android SDK / JDK 11+) and the
Gradle wrapper in this tree.

```bash
./gradlew :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/`.

Minimum SDK 24, target SDK 37.

Location permission is optional. Without it, enter coordinates on
the main screen.

## Layout of the source

```
app/src/main/java/com/example/solartime/
  SolarEngine.kt           solar-time math
  SolarLocationClient.kt   fused location
  SolarViewModel.kt        UI state and refresh loop
  MainActivity.kt          XML Views UI
  SunArcView.kt            sun-altitude arc
```

## Warranty

This program is distributed in the hope that it will be useful, but
**without any warranty**; without even the implied warranty of
merchantability or fitness for a particular purpose. See the GNU
General Public License for more details.

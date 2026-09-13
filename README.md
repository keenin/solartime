# Solar Time

> **This project was completely written by artificial intelligence.**
>
> Every line of application source, layout XML, tests, Gradle
> configuration, and documentation in this repository was generated
> by **Grok (xAI)**. No human authored the source code. A human
> requested the program and published this repository.
>
> See [NOTICE](NOTICE) for the full authorship statement.

Android app for **apparent solar time**: civil clock time adjusted
for longitude and the Equation of Time, with a live solar-velocity
factor when you move east or west.

## License

**GPL-2.0-only** — same license as the [Linux kernel](https://www.kernel.org/),
not “GPLv2 or later.” See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## What it does

- Apparent solar time to a tenth of a second, and civil vs sun offset
- 24-hour running total of how movement lengthened or shortened the solar day
- Equation of Time (Spencer Fourier), solar noon, sunrise, sunset
- GPS (Fused Location Provider) or manual latitude/longitude
- Location refresh scales with east–west speed; polar motion is dampened

## Building

Android Studio or Android SDK / JDK 11+, plus this tree’s Gradle wrapper.

```bash
./gradlew :app:assembleDebug
```

Debug APK: `app/build/outputs/apk/debug/`. Min SDK 24, target SDK 37.

Location permission is optional. Without it, enter coordinates on the main screen.

## Warranty

Distributed **without any warranty**, including merchantability or
fitness for a particular purpose. See the GNU General Public License.

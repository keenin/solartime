I keep this here for myself. It was written with AI for something I wanted, not as a product I maintain for other people. You are welcome to use it or copy it.

# Solar Time


> **This project was completely written by artificial intelligence.**
>
> Every line of application source, layout XML, tests, Gradle
> configuration, and documentation in this repository was generated
> by **Grok (xAI)**. No human authored the source code. A human
> requested the program and published this repository.
>
> See [NOTICE](NOTICE) for the full authorship statement.


Android app, and a web app in `web/`, for **apparent solar time**:
civil clock time adjusted for longitude and the Equation of Time,
with a live solar-velocity factor when you move east or west.


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


## Web


Installable static PWA in `web/`. Same apparent-solar-time math as
the Android app: Spencer’s equation of time, solar noon, sunrise
and sunset, the civil-time offset, and the 24-hour east–west total.
The browser’s Geolocation API (`watchPosition`) supplies location,
or you type latitude and longitude. Refresh speeds up as you move,
and polar motion is dampened the same way. Coordinates, the movement
history, and settings stay on the device (localStorage and IndexedDB).
Nothing is sent to a server.


Light and dark follow the system. Text size is in the settings
drawer, which opens from the same side as its button.


```bash
cd web
npm test
npm run build
```


Output is `web/dist`. For Cloudflare Pages, set the root directory
to `web`, the build command to `npm run build`, and the output
directory to `dist`.


Open the built files with any static server (or install the PWA
from a phone). The first load caches the app; after that it runs
offline. **GPL-2.0-only**, same as the Android app. See
[LICENSE](LICENSE) and [NOTICE](NOTICE).


## Warranty


Distributed **without any warranty**, including merchantability or
fitness for a particular purpose. See the GNU General Public License.


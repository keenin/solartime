# Agent rules

## Version bump

Every change, no matter how small, bumps the user-visible version so
Keenin can tell which build he has. Use semantic versioning with all
three parts, `MAJOR.MINOR.PATCH`.

- **PATCH** — tiny fixes, tweaks, and docs. `1.0.0` becomes `1.0.1`.
- **MINOR** — a new feature or a noticeable behavior change. Reset
  PATCH to 0. `1.0.1` becomes `1.1.0`.
- **MAJOR** — a big overhaul or a breaking data change. Reset MINOR
  and PATCH to 0. `1.1.0` becomes `2.0.0`.

Do not ship a two-part number such as `1.0`.

### Web

The web version is `WEB_VERSION` in `web/src/version.js`.

The settings drawer shows it as `Web version X.Y.Z`. The element is
`#web-version` at the bottom of the settings drawer in
`web/src/index.html`. `web/src/main.js` fills that element from
`WEB_VERSION_LABEL` in `web/src/version.js`.

The service worker cache name is `SERVICE_WORKER_CACHE` in the same
file (`solartime-` plus `WEB_VERSION`). `web/scripts/build.js` writes
that name into `web/dist/sw.js`. Bump `WEB_VERSION` only. That bumps
the drawer text and the cache name together. Do not type a second
version into `package.json` or into the cache name by hand.

### Android

Any change under `app/` bumps both fields in `defaultConfig` in
`app/build.gradle.kts`:

- `versionName` — `MAJOR.MINOR.PATCH`
- `versionCode` — the integer, increased by 1

The values in the tree today are `versionName` `"1.0"` and
`versionCode` `1`. The next Android change sets a three-part
`versionName` and a higher `versionCode`. A web-only change does not
bump these.

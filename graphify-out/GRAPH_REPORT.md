# Graph Report - beautiful-nobel  (2026-10-22)

## Corpus Check
- 124 files · ~209,735 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1064 nodes · 2257 edges · 66 communities (46 shown, 20 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 89 edges (avg confidence: 0.51)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c5b5590`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 46
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68

## God Nodes (most connected - your core abstractions)
1. `react` - 47 edges
2. `rules` - 28 edges
3. `analyticsEvent()` - 24 edges
4. `Media` - 23 edges
5. `Navigation` - 22 edges
6. `selectDevice()` - 21 edges
7. `Colors` - 21 edges
8. `deviceIsOnline()` - 21 edges
9. `WebRTCConnection` - 21 edges
10. `WebRTCConnectionManager` - 19 edges

## Surprising Connections (you probably didn't know these)
- `createAppStore()` --references--> `redux`  [EXTRACTED]
  src/store.js → package.json
- `fetchCoord()` --indirect_call--> `location()`  [INFERRED]
  src/actions/cached.js → src/actions/history.test.js
- `DriveListItem()` --calls--> `fetchEvents()`  [EXTRACTED]
  src/components/Dashboard/DriveListItem.jsx → src/actions/cached.js
- `DriveListItem()` --calls--> `fetchLocations()`  [EXTRACTED]
  src/components/Dashboard/DriveListItem.jsx → src/actions/cached.js
- `athenaCall()` --references--> `athena`  [EXTRACTED]
  src/actions/files.js → src/api.js

## Import Cycles
- 4-file cycle: `src/analytics.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/analytics.js`
- 4-file cycle: `src/reducers/index.js -> src/timeline/playback.js -> src/timeline/index.js -> src/store.js -> src/reducers/index.js`
- 5-file cycle: `src/reducers/globalState.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/reducers/index.js -> src/reducers/globalState.js`
- 5-file cycle: `src/actions/history.js -> src/actions/index.js -> src/timeline/playback.js -> src/timeline/index.js -> src/store.js -> src/actions/history.js`
- 5-file cycle: `src/actions/history.js -> src/actions/index.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/actions/history.js`

## Communities (66 total, 20 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (42): checkLastRoutesData(), checkRoutesData(), currentPathname(), fetchDeviceOnline(), fetchSharedDevice(), popTimelineRange(), primeFetchSubscription(), primeNav() (+34 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (37): coordsRequests, driveCoordsRequests, eventsRequests, expireCacheItems(), fetchCoord(), fetchDriveCoords(), fetchEvents(), fetchLocations() (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (10): primeGetSubscription(), billing, PrimeCheckout, PrimeManage, primeSwitchErrorMessage(), otherPrimePlan(), primePlanName(), PriorityHighIcon() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (41): barcode-detector, @commaai/my-comma-auth, connected-react-router, dayjs, history, jwt-decode, localforage, mapbox-gl (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (18): QUALITY_OPTIONS, SettingsMenu(), drawLatencyGraph(), INITIAL_LATENCY, LATENCY_LAYERS, QUALITY_INDICATOR, readRtt(), STATS_ROWS (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (6): fetchTurnCredentials(), getTurnCredentials(), stripMdnsCandidates(), wallMs(), WebRTCConnection, WebRTCConnectionManager

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (18): ErrorFallback(), timerSteps, AddCircleOutlineIcon(), Check(), ChevronIcon(), chevronPath(), ContentCopy(), DownArrow (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (20): CAMERAS, ControlsBar(), ACTIVE_STATUSES, BITRATES, cameraCoversRange(), CAMERAS, ClipMenu, defaultFilename() (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (31): assertNotBlank(), buildRenderer(), buildReport(), captureFilename(), captureOne(), captureRenderers(), clickGalleryAction(), compareImages() (+23 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (26): rules, class-methods-use-this, default-case, import/namespace, import/no-named-as-default, import/prefer-default-export, no-await-in-loop, no-case-declarations (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (5): fetchUploadUrls(), analyticsEvent(), Media, deviceIsOnline(), deviceOnCellular()

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (6): react, Colors, initialState, InfoOutline(), KeyboardBackspaceIcon(), PinCarIcon()

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (12): createRealBackend(), initBackend(), selectBackendType(), createDemoBackend(), DEMO_DEVICE, DEMO_PROFILE, demoRouteIndex(), demoRouteLogId() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.60
Nodes (3): getWindowSize(), subscribeWindowSize(), useWindowSize()

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (15): debounceLeading(), DriveVideo, getVideoState(), TODO: figure out why the src isn't set properly, TODO: fix iOS bug where video doesn't stop buffering while paused, IosPwaPopup, Referrals(), referralSteps (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (20): bcryptjs, cors, express, jsonwebtoken, otplib, qrcode, dependencies, bcryptjs (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (18): ExplorerApp, TimeDisplay, AlertStatusCodes, percentFromPointerEvent(), Timeline, mockRoute, percentToOffsetMock, thumbnailBounds (+10 more)

### Community 19 - "Community 19"
Cohesion: 0.25
Nodes (15): deleteDevice(), DEVICES_FILE, ensureDirectoryExists(), getDevice(), getDevices(), getUserById(), getUserByUsername(), getUsers() (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (17): fetchDeviceNotCar(), athena, activeDownloads, cacheKey(), call(), CLIP_RETRY_DELAYS, clipDevice, clipStorage (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (17): jsdom, oxlint, devDependencies, jsdom, oxlint, @tailwindcss/vite, @testing-library/jest-dom, @testing-library/react (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (7): updateDevices(), api, FIXME: end time not always same day as start time, NoDeviceUpsell(), emptyDevice, pairErrorToMessage(), verifyPairToken()

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (15): athenaCall(), cancelFetchUploadQueue(), cancelUploads(), doUpload(), fetchAthenaQueue(), fetchFiles(), fetchUploadQueue(), pathToFileName() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.06
Nodes (44): vitest, onHistoryMiddleware(), baseState, create(), location(), analyticsMiddleware(), attachRelTime(), clusterMap (+36 more)

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (6): BodyTeleop(), Joystick(), computeIsLandscape(), getOrientationSource(), useIsLandscape(), ArrowBackBold()

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (9): 1. Protected Files & Directories (Fork-Specific), 2. Invariants in Shared Files, 3. Conflict Resolution Strategy, `Dockerfile`, Fork Divergences & Architecture Invariants, `nginx.conf`, `src/api.js`, `src/components/anonymous.jsx` (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.20
Nodes (9): 1. Coolify (Empfohlen), 2. Standard Docker Compose, Contributing, Deployment, Development, Libraries Used, MarkenJaden Drive, Token-Optimierung mit Graphify (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.39
Nodes (5): Video(), RefreshIcon(), distance(), midpoint(), usePinchZoom()

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (10): AccountMenu(), logOut(), AppHeader(), DeviceList, InfoTooltip, AccountIcon(), GiftIcon(), GiftOpenIcon() (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (7): FILE_NAMES, updateRoute(), initialState, MediaType, SaveIcon(), ShareIcon(), WarningIcon()

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (5): CameraIcon(), CarBatteryIcon(), ContentCut(), GamepadIcon(), LivestreamIcon()

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): author, engines, bun, node, name, packageManager, private, repository (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (10): scripts, build:development, build:gallery, build:production, lint, serve, start, test (+2 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (9): background_color, display, icons, lang, name, orientation, short_name, start_url (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (4): Meta Commands, RTK - Rust Token Killer (Google Antigravity), Rule, Why

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): Agent Guidelines for MarkenJaden Drive, Knowledge Graph & Architecture Navigation (`graphify`), System Components

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): categories, correctness, globals, gtag, version, $schema, settings, react

### Community 49 - "Community 49"
Cohesion: 0.40
Nodes (5): env, browser, es6, node, vitest

### Community 50 - "Community 50"
Cohesion: 0.40
Nodes (5): ignorePatterns, build/, dist/, node_modules/, public/

### Community 51 - "Community 51"
Cohesion: 0.40
Nodes (5): plugins, import, oxc, typescript, unicorn

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (3): formatPlaceAddress(), formatPlaceName(), NOTE: this is a hack to remove the name from the address. it's necessary

### Community 53 - "Community 53"
Cohesion: 0.50
Nodes (3): BUN_INSTALL, PATH, live.sh script

### Community 54 - "Community 54"
Cohesion: 0.50
Nodes (4): contributors, Cameron Clough <cameronjclough@gmail.com>, Chris Vickery <chrisinajar@gmail.com>, Joost Wooning <jwooning@gmail.com>

### Community 55 - "Community 55"
Cohesion: 0.50
Nodes (4): trustedDependencies, core-js, jss, @sentry/cli

### Community 57 - "Community 57"
Cohesion: 0.67
Nodes (3): extractTimingSei(), SEI_PREFIX, transform()

### Community 59 - "Community 59"
Cohesion: 0.67
Nodes (3): no-plusplus, no-unused-vars, error

## Knowledge Gaps
- **208 isolated node(s):** `$schema`, `import`, `typescript`, `unicorn`, `oxc` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Community 11` to `Community 0`, `Community 1`, `Community 32`, `Community 33`, `Community 4`, `Community 2`, `Community 6`, `Community 7`, `Community 13`, `Community 14`, `Community 18`, `Community 51`, `Community 23`, `Community 25`, `Community 26`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.221) - this node is a cross-community bridge._
- **Why does `createAppStore()` connect `Community 25` to `Community 3`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Why does `redux` connect `Community 3` to `Community 25`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **What connects `$schema`, `import`, `typescript` to the rest of the system?**
  _216 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05926251097453907 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05889724310776942 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.10252100840336134 - nodes in this community are weakly interconnected._
# Graph Report - Drive  (2026-11-20)

## Corpus Check
- 140 files · ~78,746 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 6, .ico 2, .template 1)

## Summary
- 1450 nodes · 3284 edges · 79 communities (66 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 83 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `01322c4c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- actions/index.js
- ApiRequest
- PrimeManage.jsx
- dependencies
- BodyTeleop/index.jsx
- WebRTCConnection
- icons/index.jsx
- ClipMenu.jsx
- build-gallery.mjs
- rules
- analyticsEvent
- @material-ui/core
- backend.js
- utils/index.js
- DriveVideo/index.jsx
- server/package.json
- Navigation
- cached.js
- Timeline
- db.js
- clips.js
- with
- devDependencies
- explorer.jsx
- files.js
- store.js
- with
- IoniqPanel/index.jsx
- AddDevice
- MarkenJaden Drive
- storage.js
- AppHeader/index.jsx
- icons/index.jsx
- DeviceInfo/index.jsx
- package.json
- scripts
- manifest.json
- RTK - Rust Token Killer (Google Antigravity)
- Agent Guidelines for MarkenJaden Drive
- types.js
- server/index.js
- steps
- with
- createDriveServer
- web
- Navigation/index.jsx
- UploadQueue
- react
- args
- App.jsx
- args
- TimeDisplay
- WebRTCConnectionManager
- live.sh
- playback.js
- history.js
- Timeline/index.jsx
- latency-transform-worker.js
- deploy-preview.sh
- Referrals/index.jsx
- vite.config.mjs
- build.sh
- logs.sh
- start.sh
- stop.sh
- globalState.js
- vitest
- IosPwaPopup
- TimeSelect/index.jsx
- DeviceSettingsModal
- App.test.jsx
- 2. Invariants in Shared Files
- PrimeCheckout
- PrimeManage
- App
- backend.js
- DeviceList
- history.test.js

## God Nodes (most connected - your core abstractions)
1. `react` - 52 edges
2. `createDriveServer()` - 50 edges
3. `@material-ui/core` - 36 edges
4. `react-redux` - 30 edges
5. `rules` - 28 edges
6. `Media` - 24 edges
7. `analyticsEvent()` - 24 edges
8. `Navigation` - 23 edges
9. `WebRTCConnection` - 22 edges
10. `selectDevice()` - 21 edges

## Surprising Connections (you probably didn't know these)
- ``src/components/Dashboard/index.jsx` & `DriveListItem.jsx`` --references--> `Dashboard()`  [INFERRED]
  FORK_DIVERGENCES.md → src/components/Dashboard/index.jsx
- ``src/components/Dashboard/index.jsx` & `DriveListItem.jsx`` --references--> `DriveListItem()`  [INFERRED]
  FORK_DIVERGENCES.md → src/components/Dashboard/DriveListItem.jsx
- `createRealBackend()` --indirect_call--> `logOut()`  [INFERRED]
  src/api/backend.js → src/utils/auth.js
- `create()` --calls--> `onHistoryMiddleware()`  [EXTRACTED]
  src/actions/history.test.js → src/actions/history.js
- `createAppStore()` --indirect_call--> `onHistoryMiddleware()`  [INFERRED]
  src/store.js → src/actions/history.js

## Import Cycles
- 4-file cycle: `src/analytics.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/analytics.js`
- 4-file cycle: `src/reducers/index.js -> src/timeline/playback.js -> src/timeline/index.js -> src/store.js -> src/reducers/index.js`
- 5-file cycle: `src/actions/history.js -> src/actions/index.js -> src/timeline/playback.js -> src/timeline/index.js -> src/store.js -> src/actions/history.js`
- 5-file cycle: `src/actions/history.js -> src/actions/index.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/actions/history.js`
- 5-file cycle: `src/reducers/globalState.js -> src/utils/index.js -> src/timeline/index.js -> src/store.js -> src/reducers/index.js -> src/reducers/globalState.js`

## Communities (79 total, 13 thin omitted)

### Community 0 - "actions/index.js"
Cohesion: 0.15
Nodes (22): connected-react-router, checkLastRoutesData(), checkRoutesData(), currentPathname(), fetchDeviceOnline(), fetchSharedDevice(), popTimelineRange(), primeFetchSubscription() (+14 more)

### Community 1 - "ApiRequest"
Cohesion: 0.25
Nodes (3): ApiRequest, getCached(), RequestError

### Community 2 - "PrimeManage.jsx"
Cohesion: 0.32
Nodes (6): primeSwitchErrorMessage(), otherPrimePlan(), primePlanName(), PriorityHighIcon(), deviceNamePretty(), deviceTypePretty()

### Community 3 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, barcode-detector@^3.0.8, @commaai/my-comma-auth@^1.4.1, connected-react-router@^4.5.0, dayjs@^1.11.9, jwt-decode@^3.1.2, localforage@^1.10.0, mapbox-gl@^1.13.3 (+16 more)

### Community 4 - "BodyTeleop/index.jsx"
Cohesion: 0.07
Nodes (42): fetchDeviceNotCar(), CAMERAS, ControlsBar(), BodyTeleop(), ControllerOverlay(), Joystick(), TouchJoystick(), TriggerGroup() (+34 more)

### Community 5 - "WebRTCConnection"
Cohesion: 0.20
Nodes (3): stripMdnsCandidates(), wallMs(), WebRTCConnection

### Community 6 - "icons/index.jsx"
Cohesion: 0.29
Nodes (8): timerSteps, DownArrow, Forward10(), Pause(), PlayArrow(), Replay10(), VolumeOff(), VolumeUp()

### Community 7 - "ClipMenu.jsx"
Cohesion: 0.09
Nodes (18): ACTIVE_STATUSES, BITRATES, cameraCoversRange(), CAMERAS, ClipMenu, defaultFilename(), deviceRouteName(), formatDuration() (+10 more)

### Community 8 - "build-gallery.mjs"
Cohesion: 0.10
Nodes (31): assertNotBlank(), buildRenderer(), buildReport(), captureFilename(), captureOne(), captureRenderers(), clickGalleryAction(), compareImages() (+23 more)

### Community 9 - "rules"
Cohesion: 0.05
Nodes (43): categories, correctness, env, browser, es6, node, vitest, globals (+35 more)

### Community 10 - "analyticsEvent"
Cohesion: 0.13
Nodes (4): updateRoute(), Media, ShareIcon(), WarningIcon()

### Community 11 - "@material-ui/core"
Cohesion: 0.12
Nodes (7): @material-ui/core, @sentry/react, updateDevice(), billing, Colors, COMMACARE_URL, initialState

### Community 12 - "backend.js"
Cohesion: 0.15
Nodes (18): createDemoBackend(), fetchPublicFiles(), fetchPublicRoute(), getDemoRouteFiles(), listDemoRoutes(), missingAssetUrl(), routeAsset(), DEMO_DEVICE (+10 more)

### Community 13 - "utils/index.js"
Cohesion: 0.24
Nodes (6): Thumbnails(), hasRoutesData(), routes, SEGMENT_LENGTH, deviceVersionAtLeast(), getSegmentNumber()

### Community 14 - "DriveVideo/index.jsx"
Cohesion: 0.15
Nodes (7): debounceLeading(), DriveVideo, getVideoState(), VideoOverlay(), bufferVideo(), isFirefox(), isIos()

### Community 15 - "server/package.json"
Cohesion: 0.09
Nodes (22): bcryptjs, cors, express, jsonwebtoken, otplib, qrcode, ws, dependencies (+14 more)

### Community 16 - "Navigation"
Cohesion: 0.08
Nodes (6): Navigation, formatPlaceAddress(), formatPlaceName(), VisibilityHandler, PinCarIcon(), timeFromNow()

### Community 17 - "cached.js"
Cohesion: 0.06
Nodes (29): coordsRequests, driveCoordsRequests, eventsRequests, expireCacheItems(), fetchCoord(), fetchDriveCoords(), fetchEvents(), fetchLocations() (+21 more)

### Community 19 - "db.js"
Cohesion: 0.32
Nodes (16): deleteDevice(), ensureDirectoryExists(), getDataDir(), getDevice(), getDeviceBySerialOrKey(), getDevices(), getDevicesFile(), getUserById() (+8 more)

### Community 20 - "clips.js"
Cohesion: 0.20
Nodes (13): activeDownloads, cacheKey(), call(), CLIP_RETRY_DELAYS, clipDevice, clipStorage, deviceSupportsClips(), downloadClip() (+5 more)

### Community 21 - "with"
Cohesion: 0.05
Nodes (39): if, needs, permissions, runs-on, steps, timeout-minutes, DOCKER_METADATA_PR_HEAD_SHA, jobs (+31 more)

### Community 22 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, jsdom@^26.1.0, oxlint@^1.73.0, tailwindcss@^4, @tailwindcss/typography@^0.5.20, @testing-library/jest-dom@^6.6.3, vitest@^3.2.7, @vitest/coverage-v8@^3.2.7 (+9 more)

### Community 23 - "explorer.jsx"
Cohesion: 0.10
Nodes (11): localforage, analyticsEvent(), updateDevices(), api, AppDrawer(), listener(), NoDeviceUpsell(), ExplorerApp (+3 more)

### Community 24 - "files.js"
Cohesion: 0.22
Nodes (16): athenaCall(), cancelUploads(), doUpload(), fetchAthenaQueue(), fetchFiles(), fetchUploadQueue(), fetchUploadUrls(), FILE_NAMES (+8 more)

### Community 25 - "store.js"
Cohesion: 0.24
Nodes (9): redux, analyticsMiddleware(), attachRelTime(), clusterMap, getPageViewEventLocation(), getVideoPercent(), logAction(), composeEnhancers (+1 more)

### Community 26 - "with"
Cohesion: 0.06
Nodes (36): jobs, preview, preview-master, name, on, workflow_run, permissions, contents (+28 more)

### Community 27 - "IoniqPanel/index.jsx"
Cohesion: 0.24
Nodes (14): downloadDeviceLog(), fetchDeviceLogs(), fetchIoniqOverview(), fetchIoniqRecording(), logDriveRefuel(), badgeTone(), downloadTextFile(), fmtDuration() (+6 more)

### Community 29 - "MarkenJaden Drive"
Cohesion: 0.20
Nodes (9): 1. Coolify (Empfohlen), 2. Standard Docker Compose, Contributing, Deployment, Development, Libraries Used, MarkenJaden Drive, Token-Optimierung mit Graphify (+1 more)

### Community 30 - "storage.js"
Cohesion: 0.18
Nodes (32): addDriveRefuel(), appendSwaglogs(), assertSafeDongleId(), ensureDir(), getDeviceLogs(), getDeviceStats(), getFirehoseCount(), getIoniqFile() (+24 more)

### Community 31 - "AppHeader/index.jsx"
Cohesion: 0.10
Nodes (35): AccountMenu(), logOutAndRedirect(), Version(), AppHeader(), syncPushSubscription(), NotificationsDialog(), getSteps(), NotificationsHelpDialog() (+27 more)

### Community 32 - "icons/index.jsx"
Cohesion: 0.15
Nodes (12): ErrorFallback(), CameraIcon(), CarBatteryIcon(), Check(), ChevronIcon(), chevronPath(), ContentCopy(), ContentCut() (+4 more)

### Community 33 - "DeviceInfo/index.jsx"
Cohesion: 0.19
Nodes (3): DeviceInfo, deviceIsOnline(), truncateName()

### Community 34 - "package.json"
Cohesion: 0.11
Nodes (17): author, contributors, firebase@13.1.0, posthog-js@^1.419.4, react-router-dom@^5.3.4, engines, bun, node (+9 more)

### Community 35 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build:development, build:gallery, build:production, lint, serve, start, start:ssl (+3 more)

### Community 36 - "manifest.json"
Cohesion: 0.20
Nodes (9): background_color, display, icons, lang, name, orientation, short_name, start_url (+1 more)

### Community 37 - "RTK - Rust Token Killer (Google Antigravity)"
Cohesion: 0.40
Nodes (4): Meta Commands, RTK - Rust Token Killer (Google Antigravity), Rule, Why

### Community 38 - "Agent Guidelines for MarkenJaden Drive"
Cohesion: 0.50
Nodes (3): Agent Guidelines for MarkenJaden Drive, Knowledge Graph & Architecture Navigation (`graphify`), System Components

### Community 39 - "types.js"
Cohesion: 0.06
Nodes (31): ACTION_BUFFER_VIDEO, ACTION_FILES_CANCELLED_UPLOADS, ACTION_FILES_UPDATE, ACTION_FILES_UPLOADING, ACTION_FILES_URLS, ACTION_LOOP, ACTION_PAUSE, ACTION_PLAY (+23 more)

### Community 40 - "server/index.js"
Cohesion: 0.19
Nodes (7): CONTENT_TYPES, buildQcameraM3u8(), execFileAsync, generateSpriteAsync(), probeDurationSeconds(), request(), runTests()

### Community 41 - "steps"
Cohesion: 0.06
Nodes (30): runs-on, steps, timeout-minutes, BASELINE_URL, PUPPETEER_EXECUTABLE_PATH, PUPPETEER_SKIP_DOWNLOAD, VITE_APP_GIT_SHA, VITE_POSTHOG_HOST (+22 more)

### Community 42 - "with"
Cohesion: 0.06
Nodes (30): default, description, required, type, dry_run, jobs, sync, name (+22 more)

### Community 43 - "createDriveServer"
Cohesion: 0.12
Nodes (22): createDriveServer(), authMiddleware(), buildSignedUploadEntry(), extractAuthToken(), handleGetDevice(), optionalAuthMiddleware(), verifyToken(), generateDongleId() (+14 more)

### Community 44 - "web"
Cohesion: 0.09
Nodes (23): build, environment, restart, volumes, VITE_ATHENA_URL_ROOT, VITE_BILLING_URL_ROOT, VITE_COMMA_URL_ROOT, VITE_USERADMIN_URL_ROOT (+15 more)

### Community 45 - "Navigation/index.jsx"
Cohesion: 0.23
Nodes (6): react-redux, Dashboard(), IoniqPanel, LogsPanel, Prime, initialState

### Community 46 - "UploadQueue"
Cohesion: 0.23
Nodes (4): cancelFetchUploadQueue(), UploadQueue, HighlightOffIcon(), deviceOnCellular()

### Community 47 - "react"
Cohesion: 0.18
Nodes (11): react, DriveList(), DriveListItem(), defaultState, store, ScrollIntoView(), FilterList(), RightArrow() (+3 more)

### Community 48 - "args"
Cohesion: 0.10
Nodes (21): build, environment, restart, volumes, VITE_ATHENA_URL_ROOT, VITE_BILLING_URL_ROOT, VITE_COMMA_URL_ROOT, VITE_USERADMIN_URL_ROOT (+13 more)

### Community 49 - "App.jsx"
Cohesion: 0.14
Nodes (17): account, athena, athenaRequest, auth, billingRequest, devices, raw, request (+9 more)

### Community 50 - "args"
Cohesion: 0.13
Nodes (14): VITE_ATHENA_URL_ROOT, VITE_BILLING_URL_ROOT, VITE_COMMA_URL_ROOT, VITE_REFERRAL_URL, VITE_SENTRY_ENV, VITE_USERADMIN_URL_ROOT, args, context (+6 more)

### Community 53 - "live.sh"
Cohesion: 0.50
Nodes (3): BUN_INSTALL, PATH, live.sh script

### Community 54 - "playback.js"
Cohesion: 0.21
Nodes (5): percentFromPointerEvent(), store, currentOffset(), seek(), mostRecentNow

### Community 55 - "history.js"
Cohesion: 0.48
Nodes (9): onHistoryMiddleware(), createInitialState(), getDongleID(), getPrimeNav(), getRouteId(), getRouteZoom(), getStreamNav(), getZoom() (+1 more)

### Community 56 - "Timeline/index.jsx"
Cohesion: 0.18
Nodes (5): dayjs, pushTimelineRange(), DriveView, AlertStatusCodes, theme

### Community 57 - "latency-transform-worker.js"
Cohesion: 0.67
Nodes (3): extractTimingSei(), SEI_PREFIX, transform()

### Community 59 - "Referrals/index.jsx"
Cohesion: 0.42
Nodes (5): Referrals(), referralSteps, claimMailto(), referralUrl(), isMobileDevice()

### Community 60 - "vite.config.mjs"
Cohesion: 0.13
Nodes (10): @sentry/vite-plugin@^2.7.0, @tailwindcss/vite@^4, vite@^5, @vitejs/plugin-basic-ssl@1.2.0, @vitejs/plugin-react@^4.0.4, @sentry/vite-plugin, @tailwindcss/vite, vite (+2 more)

### Community 65 - "globalState.js"
Cohesion: 0.27
Nodes (9): deviceCompareFn(), eventsMap, locationMap, populateFetchedAt(), reducer(), rootReducer(), reducer(), getDefaultFilter() (+1 more)

### Community 66 - "vitest"
Cohesion: 0.33
Nodes (5): @testing-library/react@^13.4.0, @testing-library/react, mockRoute, percentToOffsetMock, thumbnailBounds

### Community 67 - "IosPwaPopup"
Cohesion: 0.24
Nodes (3): IosPwaPopup, Notification(), Clear()

### Community 68 - "TimeSelect/index.jsx"
Cohesion: 0.43
Nodes (5): selectTimeFilter(), formatDate(), parseDate(), styles, TimeSelect()

### Community 70 - "DeviceSettingsModal"
Cohesion: 0.15
Nodes (4): CommacareBadge(), DeviceSettingsModal, ErrorOutline(), SaveIcon()

### Community 71 - "App.test.jsx"
Cohesion: 0.18
Nodes (8): history@^4.10.1, history, devices, json(), makeRoute(), mockFetch(), mocks, START

### Community 72 - "2. Invariants in Shared Files"
Cohesion: 0.17
Nodes (11): 1. Protected Files & Directories (Fork-Specific), 2. Invariants in Shared Files, 3. Conflict Resolution Strategy, `Dockerfile` & `docker-compose*.yml`, Fork Divergences & Architecture Invariants, `nginx.conf`, `src/api.js`, `src/components/anonymous.jsx` (+3 more)

### Community 73 - "PrimeCheckout"
Cohesion: 0.27
Nodes (3): Prime(), PrimeCheckout, KeyboardBackspaceIcon()

### Community 76 - "backend.js"
Cohesion: 0.38
Nodes (5): @commaai/my-comma-auth, createRealBackend(), DEMO_PATH, initBackend(), selectBackendType()

### Community 78 - "history.test.js"
Cohesion: 0.40
Nodes (3): baseState, create(), drives

## Knowledge Gaps
- **3 isolated node(s):** `BUN_INSTALL`, `PATH`, `PREVIEW`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 504 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `actions/index.js`, `PrimeManage.jsx`, `dependencies`, `BodyTeleop/index.jsx`, `icons/index.jsx`, `ClipMenu.jsx`, `@material-ui/core`, `DriveVideo/index.jsx`, `cached.js`, `explorer.jsx`, `files.js`, `IoniqPanel/index.jsx`, `AppHeader/index.jsx`, `icons/index.jsx`, `package.json`, `Navigation/index.jsx`, `UploadQueue`, `App.jsx`, `Timeline/index.jsx`, `Referrals/index.jsx`, `vitest`, `TimeSelect/index.jsx`, `App.test.jsx`, `backend.js`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `createDriveServer()` (e.g. with `authMiddleware()` and `close()`) actually correct?**
  _`createDriveServer()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `BUN_INSTALL`, `PATH`, `PREVIEW` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `actions/index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14717741935483872 - nodes in this community are weakly interconnected._
- **Why does `vite` connect `vite.config.mjs` to `build-gallery.mjs`, `package.json`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Why does `@material-ui/core` connect `@material-ui/core` to `PrimeManage.jsx`, `dependencies`, `BodyTeleop/index.jsx`, `icons/index.jsx`, `ClipMenu.jsx`, `DriveVideo/index.jsx`, `cached.js`, `explorer.jsx`, `files.js`, `AppHeader/index.jsx`, `icons/index.jsx`, `package.json`, `Navigation/index.jsx`, `UploadQueue`, `react`, `Timeline/index.jsx`, `Referrals/index.jsx`, `IosPwaPopup`, `TimeSelect/index.jsx`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
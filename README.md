# IRON HORIZON — Tactical Archery & Assault

A single-page, open-world 3D action shooter built on **three.js** (bundled locally — no CDN needed, works offline).

## Run it
Open `index.html` directly in a modern browser (Chrome/Edge/Firefox), or serve the folder:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
# → http://localhost:8000
```

Click **DEPLOY** to capture the mouse. (Inside sandboxed iframes pointer-lock is unavailable —
the game falls back to *hold right-mouse-button to look*; download/open the file for the full experience.)

## Controls
| Key | Action |
|---|---|
| W A S D / Shift / Space | Move / Sprint / Jump |
| Mouse, LMB | Aim, fire rifle (hold = full auto) or draw bow (release to loose) |
| RMB | Aim down sights |
| 1 / 2 / Q / wheel | Switch rifle ↔ bow |
| R | Reload |
| V | First-person ↔ third-person |
| U | Armory / loadout (unlocks) |
| F / T | Cycle weather / skip +2 h |
| ESC | Pause & settings |

## Feature checklist
- **Open world** (~1.6 km²): procedural forest, mountain ring, desert dunes, lake, abandoned
  outpost & farms, watchtower, military camp — all with PBR materials and soft shadows.
- **Bow**: hold-to-draw power, gravity + **wind-driven arrow trajectories**, arrow drop,
  arrows stick in the world and can be recovered, headshot multipliers.
- **Rifle**: full-auto, recoil & camera kick, spread, muzzle flash, **shell ejection**,
  tracers, impact sparks, reloads, 3 unlockable guns incl. a plasma lance.
- **Systems**: health / armor / stamina, ammo & arrow economy, pickups, explosive barrels
  with chain reactions, scorch marks, particle pool, camera shake.
- **Enemy AI**: patrol → chase → attack states, burst fire, strafing, drops. Recon drones on
  moving paths. Headshot hitboxes.
- **Missions**: 4-operation campaign (clear outpost, demolitions, drone hunt, wave defense)
  then endless escalating waves. Score-based **unlocks** (3 bows, 3 arrow types, 3 rifles).
- **Environment**: full day/night cycle (sun, moon, stars, beacon), 5 weather states
  (clear / fog / rain / dust storm / storm) with wind that genuinely affects arrows.
- **HUD**: health-armor-stamina bars, ammo/arrow counter, compass with waypoint,
  rotating tac-map, wind indicator, mission tracker, kill feed, hitmarkers, FPS counter.
- **Cinematics**: ACES tone mapping, vignette, letterboxing, procedural WebAudio SFX.

## Quality settings
Pause menu → graphics **HIGH** (shadows + retina resolution) or **PERFORMANCE**,
mouse sensitivity, volume, and day-cycle speed.

## Android APK — `IronHorizon.apk`
A signed, installable WebView wrapper (~200 KB) with the full game bundled offline
plus **touch controls** (virtual joystick, FIRE / AIM / JUMP / RUN / SWAP / RLD / CAM buttons).

Install:
1. Copy `IronHorizon.apk` to your phone.
2. Enable *Settings → Security → Install unknown apps*.
3. Tap the APK → Install → open **Iron Horizon** (landscape fullscreen, immersive).

Requires Android 7.0+ (min SDK 24). Works completely offline.

Rebuild it yourself (from this folder structure) with:
`aapt2 compile/link → javac → d8 → zipalign → apksigner` (see `/home/user/apk-build`).

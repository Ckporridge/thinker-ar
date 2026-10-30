# Table Alarm — 3D & AR

Interactive USDZ viewer for the Table Alarm project (CID 1 Group 8).

**Live site:** https://ckporridge.github.io/thinker-ar/

## What it does

- **Stationary 3D view** — orbit, pinch/scroll to zoom, auto-rotate, reset, fullscreen.
- **iPhone / iPad** — tap **View in AR** to open the model in AR Quick Look.
- **Android** — tap **View in AR** to use WebXR + ARCore when available, or Google Scene Viewer as the fallback.

The stationary viewer loads the original `model.usdz` directly in the browser with Three.js. No GLB conversion is used, so the original USDZ colours stay intact.

## Files

- `index.html` — page shell and UI
- `style.css` — responsive styling
- `viewer.js` — bundled Three.js / USDZ viewer
- `model.usdz` — compressed, rotated and real-world-scaled USDZ (used for 3D and iOS AR)
- `model-android.glb` — Android AR fallback converted from the original OBJ with corrected sRGB colours
- `poster.jpg` — preview image / iOS AR link thumbnail

## Notes

- AR Quick Look requires iOS/iPadOS Safari.
- WebXR AR requires a compatible Android browser with Google Play Services for AR (ARCore).
- The model stays available in the stationary viewer on browsers without AR.
- Android AR needs ARCore. If WebXR is unavailable, the button opens Google Scene Viewer.

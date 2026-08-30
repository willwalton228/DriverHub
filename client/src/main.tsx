import "./lib/themeInit";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "leaflet/dist/leaflet.css";
// UAT ERROR SIMULATION — remove this import (and the file) after Group 1 UAT is complete.
import "./lib/uatErrorSim";

// After a new deployment, previously-loaded pages can still reference old,
// now-missing hashed JS chunk filenames (stale index.html / route manifest).
// Vite emits `vite:preloadError` when a dynamic import (e.g. a lazy-loaded
// route) fails to fetch. Auto-recover by doing a single full reload, which
// picks up the freshly deployed asset manifest. Guard with sessionStorage so
// a genuinely broken/offline chunk doesn't cause a reload loop.
const CHUNK_RELOAD_GUARD_KEY = "dh360:chunk-reload-attempted";

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (!sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

// Once the app has been running successfully for a bit, clear the guard so a
// later, unrelated deployment can still trigger a single auto-reload rather
// than being permanently suppressed for the rest of the browser session.
window.setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY), 15_000);

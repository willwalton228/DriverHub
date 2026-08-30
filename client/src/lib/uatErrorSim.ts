/**
 * UAT ERROR SIMULATION
 *
 * TEMPORARY — remove this file and its import in main.tsx after Group 1 UAT is complete.
 *
 * How to activate:
 *   Navigate to any page and append  ?uat_sim=error  to the URL, then press Enter.
 *   e.g.  https://<app>/scheduling?uat_sim=error
 *
 * What it does:
 *   - Stores the simulation flag in sessionStorage (persists across in-app navigation).
 *   - Patches window.fetch so that all requests to /api/scheduling/* and
 *     /api/corporate/scheduling/* return a synthetic HTTP 500 response.
 *   - Renders a fixed amber banner so it is always visible that simulation is active.
 *
 * How to deactivate:
 *   Click the "Disable & Return to Normal" button in the amber banner.
 *   The page reloads, the flag is cleared, and the real API is used again.
 */

const STORAGE_KEY = "dh360:uat_error_sim";
const URL_PARAM   = "uat_sim";

/** URL prefixes whose requests will be forced to 500 while simulation is active. */
const INTERCEPT_PREFIXES = [
  "/api/scheduling/",
  "/api/corporate/scheduling/",
  "/api/wiw/",
];

// ─── Activate via URL param ────────────────────────────────────────────────────
(function detectParam() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get(URL_PARAM) === "error") {
      const alreadyActive = sessionStorage.getItem(STORAGE_KEY) === "1";
      sessionStorage.setItem(STORAGE_KEY, "1");
      u.searchParams.delete(URL_PARAM);
      if (!alreadyActive) {
        // Force a full page reload so React Query's in-memory cache is cleared.
        // Without this, stale cached responses from before activation mask the
        // simulated errors on pages the user already visited this session.
        window.location.replace(u.toString());
        return;
      }
      window.history.replaceState(null, "", u.toString());
    }
  } catch {
    // Non-browser env — ignore.
  }
})();

const isActive = sessionStorage.getItem(STORAGE_KEY) === "1";

if (isActive) {
  // ─── Patch fetch ─────────────────────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);

  window.fetch = function simulatedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let urlStr: string;
    if (typeof input === "string") {
      urlStr = input;
    } else if (input instanceof URL) {
      urlStr = input.pathname + input.search;
    } else {
      urlStr = (input as Request).url;
    }

    // Only intercept relative scheduling paths to avoid breaking auth/other APIs.
    const shouldIntercept = INTERCEPT_PREFIXES.some(
      (prefix) => urlStr.startsWith(prefix) || urlStr.includes(prefix),
    );

    if (shouldIntercept) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            error: "UAT_SIMULATED_ERROR",
            message: "Simulated server error — UAT error simulation is active.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );
    }

    return originalFetch(input, init);
  };

  // ─── Render amber banner ──────────────────────────────────────────────────────
  function mountBanner() {
    if (document.getElementById("uat-error-sim-banner")) return;

    const banner = document.createElement("div");
    banner.id = "uat-error-sim-banner";
    Object.assign(banner.style, {
      position:   "fixed",
      top:        "0",
      left:       "0",
      right:      "0",
      zIndex:     "99999",
      background: "#f59e0b",
      color:      "#1c1917",
      padding:    "7px 16px",
      display:    "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap:        "12px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize:   "13px",
      fontWeight: "600",
      boxShadow:  "0 2px 6px rgba(0,0,0,0.25)",
      lineHeight: "1.4",
    });

    banner.innerHTML = `
      <span>
        ⚠&nbsp; <strong>UAT Error Simulation Active</strong>
        &nbsp;—&nbsp; Scheduling API requests are returning simulated server errors.
        Navigate to any Scheduling tab to see error states.
      </span>
      <button
        id="uat-disable-btn"
        style="
          background:#1c1917;color:#fef3c7;border:none;
          padding:5px 12px;border-radius:4px;cursor:pointer;
          font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;
        "
      >Disable &amp; Return to Normal</button>
    `;

    document.body.prepend(banner);

    // Push page content down so the banner doesn't overlap anything.
    document.documentElement.style.paddingTop = "38px";

    document.getElementById("uat-disable-btn")?.addEventListener("click", () => {
      sessionStorage.removeItem(STORAGE_KEY);
      document.documentElement.style.paddingTop = "";
      window.location.reload();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountBanner);
  } else {
    mountBanner();
  }
}

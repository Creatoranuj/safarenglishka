// Naveen Bharat PDF.js bridge — parent readiness, progress, errors + autoscroll.
//
// Message contract mirror: the parent-side types and the dwell rules this file
// implements live in `src/lib/reader/bridgeProtocol.ts` and
// `src/lib/reader/dwellEngine.ts`. Keep the two in sync when changing either.
//
// Parent → bridge: nb-autoscroll-ping | nb-autoscroll-tick { dy } |
//   nb-autoscroll-dwell { dwell } | nb-autoscroll-top | nb-goto-page { delta } |
//   nb-scroll-to-fraction { fraction }
// Bridge → parent: nb-autoscroll-pong | nb-autoscroll-state { atEnd, scrollTop } |
//   nb-autoscroll-dir { dir } | nb-autoscroll-dwelling { page, until } |
//   nb-autoscroll-route-done { page } | nb-autoscroll-user-activity |
//   nb-page-state { first, last, total } | nb-pdf-* lifecycle events
//
/** @typedef {"odd"|"even"|"all"|"custom"|"route"|"shuffle"} DwellParity */
/**
 * @typedef {Object} DwellConfig
 * @property {boolean} enabled
 * @property {DwellParity} parity
 * @property {number[]} pages   sorted unique page numbers (custom mode)
 * @property {number[]} route   ordered waypoints (route mode)
 * @property {boolean} loopRoute
 * @property {number} seconds   clamped to DWELL_MIN..DWELL_MAX
 */

(function () {
  // Authoritative float scroll position. Reading back `scrollTop` snaps to
  // whole device pixels in Android WebView, so a per-frame 0.1px delta was
  // being rounded away entirely — the old accumulator zeroed the remainder
  // and 0.1x/0.2x/0.5x barely moved. We own the position as a float.
  var pos = null;
  var lastAtEnd = null;
  var lastStateAt = 0;
  var readySent = false;
  var hooked = false;
  var lastProgress = -1;

  // ── Pause-on-pages (dwell) state, mirrored from the parent ──────────────
  // Bounds must match src/lib/reader/dwellEngine.ts.
  var DWELL_MIN_SECONDS = 1;
  var DWELL_MAX_SECONDS = 3600;
  var A4_STOP_OVERLAP = 0.08;
  var MAX_LIST_LENGTH = 500;
  var dwellCfg = { enabled: false, parity: "odd", pages: [], route: [], loopRoute: false, seconds: 30, a4: false };

  var dwellUntil = 0;      // epoch ms; while in the future, ticks are ignored
  var dwellPage = null;    // page we already paused on for this direction
  var dwellDir = 1;        // direction the guard was recorded in
  var dwellTopsAt = 0;
  var dwellTops = [];      // [{ page, top }] cached content-absolute page tops
  var routeIdx = 0;        // current waypoint index in route mode
  var routeStop = 0;       // screenful slice inside the waypoint page (A4 mode)
  var routeDir = 0;        // last direction we asked the parent for
  var dwellKey = null;     // "page:slice" already paused on for this direction

  function routeActive() {
    return dwellCfg.enabled && dwellCfg.seconds > 0 &&
      (dwellCfg.parity === "route" || dwellCfg.parity === "shuffle") &&
      dwellCfg.route.length > 0;
  }

  function dwellMatches(page) {
    if (dwellCfg.parity === "all") return true;
    if (dwellCfg.parity === "custom") return dwellCfg.pages.indexOf(page) !== -1;
    if (dwellCfg.parity === "route" || dwellCfg.parity === "shuffle")
      return dwellCfg.route.indexOf(page) !== -1;
    return dwellCfg.parity === "odd" ? page % 2 === 1 : page % 2 === 0;
  }

  function measureDwellTops(c) {
    var rootTop = c.getBoundingClientRect().top - c.scrollTop;
    dwellTops = Array.prototype.slice
      .call(document.querySelectorAll("#viewer .page"))
      .map(function (p, i) {
        var r = p.getBoundingClientRect();
        return {
          page: Number(p.getAttribute("data-page-number")) || i + 1,
          top: r.top - rootTop,
          height: r.height,
        };
      })
      .sort(function (a, b) { return a.top - b.top; });
  }

  /** Screenful stop offsets inside one page (A4 mode). Mirrors dwellEngine. */
  function pageStops(top, height, viewportHeight) {
    var h = Number(height) || 0;
    var vh = Number(viewportHeight) || 0;
    if (!(h > 0) || !(vh > 0) || h <= vh + 4) return [top];
    var step = Math.max(40, vh * (1 - A4_STOP_OVERLAP));
    var lastOffset = h - vh;
    var out = [];
    for (var o = 0; o < lastOffset - 1; o += step) out.push(top + o);
    out.push(top + lastOffset);
    return out;
  }

  /** Every position the dwell engine parks on, ascending. */
  function dwellTargets(c, now) {
    if (now - dwellTopsAt > 500 || !dwellTops.length) {
      dwellTopsAt = now;
      measureDwellTops(c);
    }
    var out = [];
    for (var i = 0; i < dwellTops.length; i++) {
      var box = dwellTops[i];
      if (!dwellMatches(box.page)) continue;
      if (!dwellCfg.a4) {
        out.push({ page: box.page, top: box.top, key: box.page + ":0" });
        continue;
      }
      var stops = pageStops(box.top, box.height, c.clientHeight);
      for (var j = 0; j < stops.length; j++) {
        out.push({ page: box.page, top: stops[j], key: box.page + ":" + j });
      }
    }
    return out.sort(function (a, b) { return a.top - b.top; });
  }

  /** Stops for the current route waypoint page, or null when unmeasured. */
  function routeStopsFor(c, now) {
    if (now - dwellTopsAt > 500 || !dwellTops.length) {
      dwellTopsAt = now;
      measureDwellTops(c);
    }
    var wanted = dwellCfg.route[routeIdx % dwellCfg.route.length];
    for (var i = 0; i < dwellTops.length; i++) {
      if (dwellTops[i].page === wanted) {
        return dwellCfg.a4
          ? pageStops(dwellTops[i].top, dwellTops[i].height, c.clientHeight)
          : [dwellTops[i].top];
      }
    }
    return null;
  }

  function resetDwell() {
    dwellUntil = 0;
    dwellPage = null;
    dwellTops = [];
    dwellTopsAt = 0;
    routeIdx = 0;
    routeStop = 0;
    routeDir = 0;
    dwellKey = null;
  }



  function post(type, detail) {
    try {
      parent.postMessage(Object.assign({ type: type }, detail || {}), "*");
    } catch (_) {}
  }

  function getContainer() {
    return document.getElementById("viewerContainer");
  }

  function hasRenderedPage() {
    return !!document.querySelector(".page[data-loaded='true'], .page canvas, .canvasWrapper canvas");
  }

  function announceReady(source) {
    if (readySent) return;
    if (!getContainer() || !hasRenderedPage()) return;
    readySent = true;
    post("nb-pdf-ready", { source: source || "dom" });
  }

  function hookPdfJsEvents() {
    if (hooked) return;
    var app = window.PDFViewerApplication;
    var bus = app && app.eventBus;
    if (!bus || typeof bus._on !== "function") return;
    hooked = true;

    bus._on("progress", function (evt) {
      var loaded = Number(evt && evt.loaded) || 0;
      var total = Number(evt && evt.total) || 0;
      var percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : -1;
      if (percent !== lastProgress) {
        lastProgress = percent;
        post("nb-pdf-progress", { percent: percent, loaded: loaded, total: total });
      }
    });
    bus._on("pagesloaded", function (evt) {
      post("nb-pdf-pagesloaded", { pages: evt && evt.pagesCount });
      announceReady("pagesloaded");
    });
    bus._on("pagerendered", function (evt) {
      post("nb-pdf-pagerendered", { pageNumber: evt && evt.pageNumber });
      announceReady("pagerendered");
    });
  }

  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nb-autoscroll-tick") {
      var c = getContainer();
      if (c) {
        var tickNow = Date.now();
        // Parked on a page boundary — swallow ticks until the dwell expires.
        if (dwellUntil && tickNow < dwellUntil) {
          pos = c.scrollTop;
          return;
        }
        if (dwellUntil && tickNow >= dwellUntil) dwellUntil = 0;
        var max = c.scrollHeight - c.clientHeight;
        // Re-seed when the user scrolled with a finger/wheel, so manual input
        // coexists with autoscroll instead of being fought frame by frame.
        if (pos === null || Math.abs(c.scrollTop - pos) > 2) pos = c.scrollTop;
        var dy = Number(data.dy) || 0;
        var prevPos = pos;
        var viewer = document.getElementById("viewer");
        var isRoute = routeActive();
        var target = null;
        var stopsForRoute = null;
        if (isRoute) {
          stopsForRoute = routeStopsFor(c, tickNow);
          target = stopsForRoute
            ? stopsForRoute[Math.min(routeStop, stopsForRoute.length - 1)]
            : null;
          if (target !== null) {
            // Each leg heads toward its waypoint — the bridge owns the sign
            // and mirrors it back so the parent's ticks follow (6 ↓ 3 ↑ 8 ↓ 2 ↑).
            var want = target > pos + 0.5 ? 1 : target < pos - 0.5 ? -1 : routeDir || 1;
            dy = Math.abs(dy) * want;
            if (want !== routeDir) {
              routeDir = want;
              post("nb-autoscroll-dir", { dir: want });
            }
          }
        }
        // Clamp both ends so reverse autoscroll parks at the top instead of
        // accumulating a negative position.
        pos = Math.max(0, Math.min(max, pos + dy));
        // Integer part goes to the scroller (it can only land on whole
        // pixels); the 0-1px remainder is painted as a compositor transform on
        // the pages wrapper so 0.1-0.5x glides instead of stepping 1px every
        // few frames.
        var whole = Math.floor(pos);
        c.scrollTop = whole;
        if (viewer) {
          var frac = pos - whole;
          viewer.style.willChange = "transform";
          viewer.style.transform = "translate3d(0, " + -frac + "px, 0)";
        }
        if (isRoute) {
          if (target !== null) {
            var reached = (prevPos - target) * (pos - target) <= 0 || Math.abs(pos - target) < 1;
            if (reached) {
              pos = target;
              c.scrollTop = Math.floor(target);
              if (viewer) viewer.style.transform = "";
              dwellUntil = tickNow + dwellCfg.seconds * 1000;
              var stopPage = dwellCfg.route[routeIdx % dwellCfg.route.length];
              post("nb-autoscroll-dwelling", { page: stopPage, until: dwellUntil });
              postPageState();
              // A4 mode: finish the remaining screenfuls of this page first.
              if (stopsForRoute && routeStop < stopsForRoute.length - 1) {
                routeStop += 1;
                routeDir = 0;
                return;
              }
              routeStop = 0;
              var isLast = routeIdx >= dwellCfg.route.length - 1;
              if (isLast && !dwellCfg.loopRoute) {
                post("nb-autoscroll-route-done", { page: stopPage });
              } else {
                routeIdx = isLast ? 0 : routeIdx + 1;
                routeDir = 0;
              }
              return;
            }
          }
        } else if (dwellCfg.enabled && dwellCfg.seconds > 0 && dy !== 0) {
          // Pause-on-pages: did a matching page top cross the viewport top
          // between the previous and the new position? Direction-agnostic.
          var dir = dy < 0 ? -1 : 1;
          if (dir !== dwellDir) { dwellDir = dir; dwellPage = null; dwellKey = null; }
          var targets = dwellTargets(c, tickNow);
          var lo = Math.min(prevPos, pos);
          var hi = Math.max(prevPos, pos);
          var hits = targets.filter(function (p) {
            return p.top > lo + 0.001 && p.top <= hi + 0.001;
          });
          var crossed = dir < 0 ? hits[hits.length - 1] : hits[0];
          if (crossed && dwellKey !== crossed.key) {
            dwellKey = crossed.key;
            dwellPage = crossed.page;
            dwellUntil = tickNow + dwellCfg.seconds * 1000;
            pos = crossed.top;
            c.scrollTop = Math.floor(crossed.top);
            if (viewer) viewer.style.transform = "";
            post("nb-autoscroll-dwelling", { page: crossed.page, until: dwellUntil });
            postPageState();
            return;
          }
        }


        var atEnd = pos + c.clientHeight >= c.scrollHeight - 1;
        // Only reply when `atEnd` flips, or at most every 250ms. Replying on
        // every tick meant 60 structured-clone hops per second in each
        // direction for a value nothing else consumes.
        var now = Date.now();
        if (atEnd !== lastAtEnd || now - lastStateAt > 250) {
          lastAtEnd = atEnd;
          lastStateAt = now;
          try {
            e.source && e.source.postMessage(
              { type: "nb-autoscroll-state", atEnd: atEnd, scrollTop: pos },
              "*"
            );
          } catch (_) {}
        }
      }
    } else if (data.type === "nb-autoscroll-dwell") {
      var cfg = data.dwell || {};
      var sanitizeList = function (v) {
        return Array.isArray(v)
          ? v.map(Number)
              .filter(function (n) { return isFinite(n) && n > 0 && n < 100000; })
              .slice(0, MAX_LIST_LENGTH)
          : [];
      };
      dwellCfg = {
        enabled: !!cfg.enabled,
        parity: cfg.parity === "even" || cfg.parity === "all" || cfg.parity === "custom" ||
          cfg.parity === "route" || cfg.parity === "shuffle"
          ? cfg.parity
          : "odd",
        pages: sanitizeList(cfg.pages),
        route: sanitizeList(cfg.route),
        loopRoute: !!cfg.loopRoute,
        a4: !!cfg.a4,
        seconds: Math.max(
          DWELL_MIN_SECONDS,
          Math.min(DWELL_MAX_SECONDS, Math.round(Number(cfg.seconds) || 30))
        ),
      };


      resetDwell();
    } else if (data.type === "nb-autoscroll-ping") {
      pos = null; // fresh run — reseed from the live container on first tick
      resetDwell();
      var vp = document.getElementById("viewer");
      if (vp) { vp.style.transform = ""; vp.style.willChange = ""; }
      try {
        e.source && e.source.postMessage({ type: "nb-autoscroll-pong" }, "*");
      } catch (_) {}
    } else if (data.type === "nb-autoscroll-top") {
      var ct = getContainer();
      if (ct) ct.scrollTop = 0;
      pos = null; // fresh run — reseed from the live container on first tick
      resetDwell();
      var v0 = document.getElementById("viewer");
      if (v0) { v0.style.transform = ""; v0.style.willChange = ""; }

    } else if (data.type === "nb-goto-page") {
      var cg = getContainer();
      if (!cg) return;
      var delta = Number(data.delta) || 1;
      var tops = pageTops(cg);
      var cur = cg.scrollTop;
      var target = null;
      if (delta > 0) {
        for (var i = 0; i < tops.length; i++) { if (tops[i] > cur + 4) { target = tops[i]; break; } }
        if (target === null) target = cg.scrollHeight;
      } else {
        for (var j = tops.length - 1; j >= 0; j--) { if (tops[j] < cur - 4) { target = tops[j]; break; } }
        if (target === null) target = 0;
      }
      cg.scrollTop = Math.max(0, target);
      pos = null;
      postPageState();
    } else if (data.type === "nb-scroll-to-fraction") {
      var cf = getContainer();
      if (!cf) return;
      var f = Number(data.fraction);
      if (!isFinite(f)) return;
      f = Math.max(0, Math.min(1, f));
      cf.scrollTop = f * Math.max(0, cf.scrollHeight - cf.clientHeight);
      pos = null;
      postPageState();
    }
  });

  // ── Page indicator state (Drive-style pill in the parent) ───────────────
  function pageEls() {
    return Array.prototype.slice.call(document.querySelectorAll("#viewer .page"));
  }
  function pageTops(c) {
    var rootTop = c.getBoundingClientRect().top - c.scrollTop;
    return pageEls().map(function (p) {
      return p.getBoundingClientRect().top - rootTop;
    });
  }
  var lastPageLabel = "";
  function postPageState() {
    var c = getContainer();
    if (!c) return;
    var els = pageEls();
    if (!els.length) return;
    var rootTop = c.getBoundingClientRect().top - c.scrollTop;
    var viewTop = c.scrollTop;
    var viewBottom = viewTop + c.clientHeight;
    var first = null;
    var last = null;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      var top = r.top - rootTop;
      var bottom = r.bottom - rootTop;
      if (bottom > viewTop + 4 && top < viewBottom - 4) {
        var num = Number(els[i].getAttribute("data-page-number")) || i + 1;
        if (first === null) first = num;
        last = num;
      }
    }
    if (first === null) { first = 1; last = 1; }
    var label = first + "-" + last + "/" + els.length;
    if (label === lastPageLabel) return;
    lastPageLabel = label;
    post("nb-page-state", { first: first, last: last, total: els.length });
  }
  var pageRaf = 0;
  function onPageScroll() {
    if (pageRaf) return;
    pageRaf = requestAnimationFrame(function () {
      pageRaf = 0;
      postPageState();
    });
  }
  (function attachPageScroll() {
    var c = getContainer();
    if (!c) { setTimeout(attachPageScroll, 250); return; }
    c.addEventListener("scroll", onPageScroll, { passive: true });
    postPageState();
  })();


  // Bubble user activity from inside the iframe back to the parent so the
  // FAB can un-hide itself when the reader taps the page.
  function pingActivity() { post("nb-autoscroll-user-activity"); }
  window.addEventListener("touchstart", pingActivity, { passive: true });
  window.addEventListener("pointerdown", pingActivity, { passive: true });
  window.addEventListener("wheel", pingActivity, { passive: true });
  window.addEventListener("error", function (e) {
    post("nb-pdf-error", { message: (e && e.message) || "PDF viewer error" });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e && e.reason;
    var message = (reason && reason.message) || String(reason || "");
    var name = (reason && reason.name) || "";
    if (name === "AbortError" || /aborted a request|aborted|AbortError/i.test(message)) {
      try { e.preventDefault(); } catch (_) {}
      return;
    }
    post("nb-pdf-error", { message: message || "PDF viewer promise rejection" });
  });

  // Announce readiness only after PDF.js has painted at least one page.
  function announce() {
    hookPdfJsEvents();
    if (getContainer()) {
      post("nb-autoscroll-pong");
      announceReady("poll");
    }
    if (!readySent) setTimeout(announce, 200);
  }
  announce();

  setTimeout(function () {
    if (!readySent) post("nb-pdf-timeout", { ms: 15000 });
  }, 15000);
})();

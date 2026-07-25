// Safar English PDF.js bridge — parent readiness, progress, errors + autoscroll.
(function () {
  var acc = 0; // fractional remainder so sub-pixel speeds (0.1–0.5) aren't rounded away.
  var readySent = false;
  var hooked = false;
  var lastProgress = -1;

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
        // Additive scroll so manual finger/wheel input coexists with autoscroll.
        // Use float scrollTop for smoother sub-pixel motion at low speeds.
        acc += Number(data.dy) || 0;
        if (acc >= 0.05) {
          var dy = acc;
          acc = 0;
          c.scrollTop = c.scrollTop + dy;
        }
        var atEnd = c.scrollTop + c.clientHeight >= c.scrollHeight - 1;
        try {
          e.source && e.source.postMessage(
            { type: "nb-autoscroll-state", atEnd: atEnd, scrollTop: c.scrollTop },
            "*"
          );
        } catch (_) {}
      }
    } else if (data.type === "nb-autoscroll-ping") {
      try {
        e.source && e.source.postMessage({ type: "nb-autoscroll-pong" }, "*");
      } catch (_) {}
    }
  });

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

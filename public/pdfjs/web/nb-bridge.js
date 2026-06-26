// Safar English Ka autoscroll bridge — listens for parent postMessage and scrolls the PDF viewer container.
(function () {
  var acc = 0; // fractional remainder so sub-pixel speeds (0.1–0.5) aren't rounded away.
  function getContainer() {
    return document.getElementById("viewerContainer");
  }
  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nb-autoscroll-tick") {
      var c = getContainer();
      if (c) {
        // Additive scroll so manual finger/wheel input coexists with autoscroll.
        acc += Number(data.dy) || 0;
        var whole = Math.trunc(acc);
        if (whole !== 0) {
          acc -= whole;
          c.scrollBy(0, whole);
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
  // Announce readiness when the viewer container exists.
  function announce() {
    if (getContainer()) {
      try { parent.postMessage({ type: "nb-autoscroll-pong" }, "*"); } catch (_) {}
    } else {
      setTimeout(announce, 200);
    }
  }
  announce();
})();

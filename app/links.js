/* Hand-off targets for a top-level Safari / home-screen app.
 * sms: opens Messages directly.
 * Gmail web links become googlegmail:// with the original https URL kept as fallback.
 * Every other http(s) link is left alone.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BenjiLinks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function plan(href) {
    var s = String(href || "").trim();
    if (/^sms:/i.test(s)) return { kind: "sms", href: s };

    var gm = /^https:\/\/mail\.google\.com\/mail\/u\/[^?#]*\?authuser=([^&#]+)[^#]*#(.*)$/i.exec(s);
    if (gm) {
      var email = gm[1];
      try {
        email = decodeURIComponent(email);
      } catch (err) {
        /* keep the raw value */
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        var th = /^(?:all|inbox)\/([A-Za-z0-9]+)$/.exec(gm[2]);
        var threadId = th ? th[1] : gm[2] === "inbox" ? "" : null;
        if (threadId !== null) {
          var native = threadId
            ? "googlegmail:///cv=" + threadId + "/accountId=" + encodeURIComponent(email)
            : "googlegmail://";
          return { kind: "gmail", href: s, web: s, native: native, email: email, threadId: threadId };
        }
      }
    }

    return { kind: "web", href: s };
  }

  return { plan: plan };
});

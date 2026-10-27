/* Benji's Day encryption.
 * Envelope JSON: {"v":1,"salt":"<base64>","iv":"<base64>","ct":"<base64>"}
 * salt: 16 random bytes. iv: 12 random bytes.
 * key: PBKDF2-SHA256(passcode as UTF-8, salt, 210000 iterations, 256-bit)
 * cipher: AES-256-GCM. ct is ciphertext || 16-byte GCM tag (WebCrypto default).
 * Base64 is standard RFC 4648 with + / and = padding (not base64url).
 * Plaintext is UTF-8 JSON.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BenjiCrypto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ITERATIONS = 210000;

  function bytesToB64(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = "";
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function b64ToBytes(b64) {
    var s = atob(String(b64).replace(/\s+/g, ""));
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function deriveKey(passcode, salt) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey("raw", enc.encode(String(passcode)), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  function encryptJSON(passcode, obj) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var pt = new TextEncoder().encode(JSON.stringify(obj));
    return deriveKey(passcode, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, pt).then(function (buf) {
        return {
          v: 1,
          salt: bytesToB64(salt),
          iv: bytesToB64(iv),
          ct: bytesToB64(new Uint8Array(buf)),
        };
      });
    });
  }

  function decryptJSON(passcode, env) {
    if (!env || env.v !== 1 || !env.salt || !env.iv || !env.ct) {
      return Promise.reject(new Error("bad envelope"));
    }
    var salt;
    var iv;
    var ct;
    try {
      salt = b64ToBytes(env.salt);
      iv = b64ToBytes(env.iv);
      ct = b64ToBytes(env.ct);
    } catch (err) {
      return Promise.reject(new Error("bad envelope"));
    }
    if (salt.length !== 16 || iv.length !== 12 || ct.length < 17) {
      return Promise.reject(new Error("bad envelope"));
    }
    return deriveKey(passcode, salt).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct).then(function (buf) {
        return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
      });
    });
  }

  function topicFromPasscode(passcode) {
    var data = new TextEncoder().encode("benji-topic:" + String(passcode));
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      var hex = "";
      var u = new Uint8Array(buf);
      for (var i = 0; i < u.length; i++) hex += u[i].toString(16).padStart(2, "0");
      return "benji-" + hex.slice(0, 24);
    });
  }

  return {
    ITERATIONS: ITERATIONS,
    bytesToB64: bytesToB64,
    b64ToBytes: b64ToBytes,
    encryptJSON: encryptJSON,
    decryptJSON: decryptJSON,
    topicFromPasscode: topicFromPasscode,
  };
});

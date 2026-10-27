/* Encryption shared by the page and the Node test.
 * Data envelope and ntfy events:
 *   PBKDF2-SHA256, 210000 iterations, 16-byte salt, AES-256-GCM, 12-byte iv.
 *   Ciphertext is WebCrypto's output (ciphertext || 16-byte tag), standard base64.
 * Face ID wrap (local only):
 *   PRF salt = SHA-256("benji-day:face-id:prf:v1")
 *   HKDF-SHA256(PRF secret) -> AES-256-GCM around the passcode.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BenjiCrypto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var ITERATIONS = 210000;
  var PRF_LABEL = "benji-day:face-id:prf:v1";
  var HKDF_SALT = "benji-day:face-id:hkdf-salt:v1";
  var HKDF_INFO = "benji-day:passcode-wrap:v1";

  function b64encode(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = "";
    var step = 0x8000;
    for (var i = 0; i < u8.length; i += step) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + step));
    }
    return btoa(s);
  }

  function b64decode(str) {
    var s = atob(String(str || ""));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function importPasscode(passcode) {
    return crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(String(passcode)),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
  }

  function deriveAes(passcode, salt, usages) {
    return importPasscode(passcode).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        usages
      );
    });
  }

  function encryptJson(passcode, value) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var plain = new TextEncoder().encode(JSON.stringify(value));
    return deriveAes(passcode, salt, ["encrypt"]).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain);
    }).then(function (ct) {
      return { v: 1, salt: b64encode(salt), iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) };
    });
  }

  function decryptJson(passcode, envelope) {
    return Promise.resolve().then(function () {
      if (!envelope || envelope.v !== 1) return null;
      var salt, iv, ct;
      try {
        salt = b64decode(envelope.salt);
        iv = b64decode(envelope.iv);
        ct = b64decode(envelope.ct);
      } catch (e) {
        return null;
      }
      if (salt.length !== 16 || iv.length !== 12 || ct.length < 17) return null;
      return deriveAes(passcode, salt, ["decrypt"]).then(function (key) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
      }).then(function (buf) {
        var obj = JSON.parse(new TextDecoder().decode(buf));
        if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
        return obj;
      }).catch(function () {
        return null;
      });
    });
  }

  function topicForPasscode(passcode) {
    var data = new TextEncoder().encode("benji-topic:" + String(passcode));
    return crypto.subtle.digest("SHA-256", data).then(function (buf) {
      var hex = Array.from(new Uint8Array(buf)).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
      return "benji-" + hex.slice(0, 24);
    });
  }

  function prfSalt() {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(PRF_LABEL)).then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function deriveWrapKey(secret, usage) {
    if (!(secret instanceof Uint8Array) || secret.length !== 32) {
      return Promise.reject(new Error("prf"));
    }
    return crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]).then(function (ikm) {
      return crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new TextEncoder().encode(HKDF_SALT),
          info: new TextEncoder().encode(HKDF_INFO),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        false,
        [usage]
      );
    });
  }

  function wrapPasscode(secret, passcode) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var plain = new TextEncoder().encode(String(passcode));
    return deriveWrapKey(secret, "encrypt").then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain);
    }).then(function (ct) {
      return { v: 1, iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) };
    });
  }

  function unwrapPasscode(secret, wrapped) {
    return Promise.resolve().then(function () {
      if (!wrapped || wrapped.v !== 1) return null;
      var iv, ct;
      try {
        iv = b64decode(wrapped.iv);
        ct = b64decode(wrapped.ct);
      } catch (e) {
        return null;
      }
      if (iv.length !== 12 || ct.length < 17) return null;
      return deriveWrapKey(secret, "decrypt").then(function (key) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
      }).then(function (buf) {
        return new TextDecoder().decode(buf);
      }).catch(function () {
        return null;
      });
    });
  }

  return {
    ITERATIONS: ITERATIONS,
    PRF_LABEL: PRF_LABEL,
    HKDF_SALT: HKDF_SALT,
    HKDF_INFO: HKDF_INFO,
    b64encode: b64encode,
    b64decode: b64decode,
    encryptJson: encryptJson,
    decryptJson: decryptJson,
    encryptJSON: encryptJson,
    decryptJSON: function (passcode, envelope) {
      return decryptJson(passcode, envelope).then(function (value) {
        if (value == null) return Promise.reject(new Error("bad envelope"));
        return value;
      });
    },
    topicForPasscode: topicForPasscode,
    topicFromPasscode: topicForPasscode,
    bytesToB64: b64encode,
    b64ToBytes: b64decode,
    prfSalt: prfSalt,
    wrapPasscode: wrapPasscode,
    unwrapPasscode: unwrapPasscode,
  };
});

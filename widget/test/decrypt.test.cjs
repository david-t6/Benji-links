"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const Benji = require("../../app/crypto.js");

const src = fs.readFileSync(path.join(__dirname, "..", "benjis-day-widget.js"), "utf8");
const start = src.indexOf("const DECRYPT_JS = `");
const end = src.indexOf("`.trim();", start);
assert.ok(start >= 0 && end > start, "widget decrypt source is present");
const cooked = Function("return " + src.slice(src.indexOf("`", start), end + 1))();
const benjiDecrypt = new Function(cooked + "\nreturn benjiDecrypt;")();

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "app", "data.sample.json"), "utf8"));

test("widget decrypt matches the app envelope", async function () {
  const pass = "widget-pass";
  const env = await Benji.encryptJson(pass, sample);
  assert.strictEqual(env.v, 1);
  assert.strictEqual(Buffer.from(env.salt, "base64").length, 16);
  assert.strictEqual(Buffer.from(env.iv, "base64").length, 12);
  const out = await benjiDecrypt(pass, env);
  assert.deepStrictEqual(out, sample);
  await assert.rejects(function () { return benjiDecrypt("nope", env); }, function (err) {
    assert.strictEqual(err.name, "OperationError");
    return true;
  });
});

test("webview decrypt waits for completion and only a bad passcode clears the keychain", function () {
  assert.match(src, /loadHTML\("<html><\/html>", APP_URL\)/);
  assert.match(src, /evaluateJavaScript\(expr, true\)/);
  assert.match(src, /completion\(JSON\.stringify\(d\)\)/);
  assert.match(src, /completion\('ERR:'/);
  assert.match(src, /Tap to set up/);
  assert.match(src, /scriptable:\/\/\/run\//);
  assert.match(src, /Saved\. Your widget will update in a minute\./);
  assert.match(src, /const KEYCHAIN_KEY = "benjis-day-passcode"/);
  assert.match(src, /const KEYCHAIN_AES = "benjis-day-aes-key"/);
  assert.doesNotMatch(src, /evaluateJavaScript\(expr\)/);
  assert.doesNotMatch(src, /loadURL\(APP_URL\)/);
  const forget = src.slice(src.indexOf("function forgetPasscode"), src.indexOf("function parseWebResult"));
  assert.strictEqual(forget.split("Keychain.remove").length - 1, 2);
  assert.match(forget, /config\.runsInWidget/);
  const callAt = src.indexOf("forgetPasscode();");
  const call = src.slice(callAt - 120, callAt);
  assert.match(call, /OperationError/);
  assert.strictEqual(src.split("Keychain.remove").length - 1, 2);
});

test("cached aes key decrypts without another PBKDF2", async function () {
  const pass = "widget-pass";
  const env = await Benji.encryptJson(pass, sample);
  const open = new Function(cooked + "\nreturn { benjiUnlock: benjiUnlock, benjiAesDecrypt: benjiAesDecrypt };")();
  const unlocked = await open.benjiUnlock(pass, env);
  assert.deepStrictEqual(unlocked.data, sample);
  assert.strictEqual(Buffer.from(unlocked.rawKey, "base64").length, 32);
  const again = await open.benjiAesDecrypt(unlocked.rawKey, env);
  assert.deepStrictEqual(again, sample);
  const other = await Benji.encryptJson(pass, sample);
  await assert.rejects(function () { return open.benjiAesDecrypt(unlocked.rawKey, other); }, function (err) {
    assert.strictEqual(err.name, "OperationError");
    return true;
  });
});

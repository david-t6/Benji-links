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
  await assert.rejects(function () { return benjiDecrypt("nope", env); });
});

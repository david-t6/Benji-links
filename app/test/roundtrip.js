/* Encrypt with Node's crypto (the outside-script spec) and decrypt with the
 * app's WebCrypto helpers, then the other way around. Also checks link plans
 * and the sample file's keys. */
"use strict";

var assert = require("assert");
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var BenjiCrypto = require("../crypto.js");
var BenjiLinks = require("../links.js");

function encryptSpec(passcode, obj) {
  var salt = crypto.randomBytes(16);
  var iv = crypto.randomBytes(12);
  var key = crypto.pbkdf2Sync(Buffer.from(String(passcode), "utf8"), salt, 210000, 32, "sha256");
  var cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  var pt = Buffer.from(JSON.stringify(obj), "utf8");
  var enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  var ct = Buffer.concat([enc, cipher.getAuthTag()]);
  return {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
  };
}

function decryptSpec(passcode, env) {
  var salt = Buffer.from(env.salt, "base64");
  var iv = Buffer.from(env.iv, "base64");
  var ct = Buffer.from(env.ct, "base64");
  var tag = ct.subarray(ct.length - 16);
  var data = ct.subarray(0, ct.length - 16);
  var key = crypto.pbkdf2Sync(Buffer.from(String(passcode), "utf8"), salt, 210000, 32, "sha256");
  var decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  var pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(pt.toString("utf8"));
}

function testLinks() {
  var sms = BenjiLinks.plan("sms:+15555550123");
  assert.strictEqual(sms.kind, "sms");
  assert.strictEqual(sms.href, "sms:+15555550123");
  var group = BenjiLinks.plan("sms:");
  assert.strictEqual(group.kind, "sms");
  assert.strictEqual(group.href, "sms:");

  var thread = "https://mail.google.com/mail/u/?authuser=benji.demo%40example.com#all/demoThread1";
  var g = BenjiLinks.plan(thread);
  assert.strictEqual(g.kind, "gmail");
  assert.strictEqual(g.web, thread);
  assert.strictEqual(g.native, "googlegmail://");
  assert.strictEqual(g.href, "googlegmail://");

  var inbox = "https://mail.google.com/mail/u/?authuser=cafe.demo@example.com#inbox";
  var box = BenjiLinks.plan(inbox);
  assert.strictEqual(box.kind, "gmail");
  assert.strictEqual(box.native, "googlegmail://");
  assert.strictEqual(box.web, inbox);

  var hashInbox = "https://mail.google.com/mail/u/?authuser=cafe.demo@example.com#inbox/demoThread9";
  var boxed = BenjiLinks.plan(hashInbox);
  assert.strictEqual(boxed.native, "googlegmail://");

  var web = BenjiLinks.plan("https://example.com/calendar/demo-event");
  assert.strictEqual(web.kind, "web");
  assert.strictEqual(web.href, "https://example.com/calendar/demo-event");
}

function testSampleShape() {
  var sample = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data.sample.json"), "utf8"));
  var keys = [
    "v",
    "UPDATED",
    "DAY_ISO",
    "DATE_LABEL",
    "schedule",
    "groups",
    "needsReply",
    "fyi",
    "gmail",
    "purchases",
    "byAccount",
    "cash",
    "owed",
    "spend",
    "skipped",
  ];
  assert.deepStrictEqual(Object.keys(sample).sort(), keys.slice().sort());
  assert.strictEqual(sample.v, 1);
  assert.deepStrictEqual(
    sample.groups.map(function (g) {
      return g.name;
    }),
    ["Church", "Weekday Coffee", "Grace & Growth", "Personal"]
  );
  sample.groups.forEach(function (g) {
    assert.ok(Array.isArray(g.waiting) && Array.isArray(g.todo));
  });
}

async function testCrypto() {
  var sample = {
    v: 1,
    UPDATED: "Sample data",
    note: "round trip",
    n: 7,
    ok: true,
  };
  var pass = "correct horse";
  var env = encryptSpec(pass, sample);
  assert.strictEqual(Buffer.from(env.salt, "base64").length, 16);
  assert.strictEqual(Buffer.from(env.iv, "base64").length, 12);
  assert.ok(Buffer.from(env.ct, "base64").length > 16);

  var out = await BenjiCrypto.decryptJSON(pass, env);
  assert.deepStrictEqual(out, sample);

  var env2 = await BenjiCrypto.encryptJSON(pass, sample);
  assert.strictEqual(Buffer.from(env2.salt, "base64").length, 16);
  assert.strictEqual(Buffer.from(env2.iv, "base64").length, 12);
  var back = decryptSpec(pass, env2);
  assert.deepStrictEqual(back, sample);

  await assert.rejects(function () {
    return BenjiCrypto.decryptJSON("nope", env);
  });

  var fancy = "café 🔑";
  var env3 = encryptSpec(fancy, { v: 1, city: "Montréal" });
  var fancyOut = await BenjiCrypto.decryptJSON(fancy, env3);
  assert.deepStrictEqual(fancyOut, { v: 1, city: "Montréal" });

  var topic = await BenjiCrypto.topicFromPasscode(pass);
  var expect =
    "benji-" + crypto.createHash("sha256").update("benji-topic:" + pass, "utf8").digest("hex").slice(0, 24);
  assert.strictEqual(topic, expect);
  assert.match(topic, /^benji-[0-9a-f]{24}$/);
}

testLinks();
testSampleShape();
testCrypto()
  .then(function () {
    console.log("roundtrip ok");
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });

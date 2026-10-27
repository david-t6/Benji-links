"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Benji = require("../crypto.js");

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64e(bytes) {
  return Buffer.from(bytes).toString("base64");
}
function b64d(s) {
  return new Uint8Array(Buffer.from(s, "base64"));
}

async function deriveKey(passcode, salt, usage) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

async function independentEncrypt(passcode, value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt, "encrypt");
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(value))
  ));
  return { v: 1, salt: b64e(salt), iv: b64e(iv), ct: b64e(ct) };
}

async function independentDecrypt(passcode, envelope) {
  const salt = b64d(envelope.salt);
  const iv = b64d(envelope.iv);
  const ct = b64d(envelope.ct);
  const key = await deriveKey(passcode, salt, "decrypt");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(dec.decode(pt));
}

async function independentTopic(passcode) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode("benji-topic:" + passcode));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "benji-" + hex.slice(0, 24);
}

async function independentWrapKey(secret, usage) {
  const ikm = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("benji-day:face-id:hkdf-salt:v1"),
      info: enc.encode("benji-day:passcode-wrap:v1"),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

const sample = {
  v: 1,
  UPDATED: "9:04 AM ET",
  DAY_ISO: "2026-10-27",
  groups: [{ name: "Personal", waiting: [], todo: [{ text: "Example only", done: false }] }],
  needsReply: [],
};

test("sample file matches the plaintext shape and is not encrypted", () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data.sample.json"), "utf8"));
  const keys = [
    "v", "UPDATED", "DAY_ISO", "DATE_LABEL", "schedule", "groups",
    "needsReply", "fyi", "gmail", "purchases", "byAccount", "cash", "owed", "spend", "skipped",
  ];
  for (const key of keys) assert.ok(Object.prototype.hasOwnProperty.call(file, key), key);
  assert.equal(file.v, 1);
  assert.equal(file.salt, undefined);
  assert.equal(file.ct, undefined);
  assert.equal(file.groups[0].name, "Church");
  assert.match(JSON.stringify(file), /example\.com/);
  assert.doesNotMatch(JSON.stringify(file), /bjp\.net|weekdaycoffee\.com|antiochorlando/);
});

test("encrypt and decrypt round-trip against an independent implementation", { timeout: 120000 }, async () => {
  assert.equal(Benji.ITERATIONS, 210000);

  const fromApp = await Benji.encryptJson("correct horse", sample);
  assert.equal(fromApp.v, 1);
  assert.match(fromApp.salt, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(b64d(fromApp.salt).length, 16);
  assert.equal(b64d(fromApp.iv).length, 12);
  assert.ok(b64d(fromApp.ct).length > 16);
  assert.deepEqual(await independentDecrypt("correct horse", fromApp), sample);
  assert.equal(await Benji.decryptJson("correct horse", fromApp).then((v) => JSON.stringify(v)), JSON.stringify(sample));

  const fromSpec = await independentEncrypt("correct horse", sample);
  assert.deepEqual(await Benji.decryptJson("correct horse", fromSpec), sample);

  assert.equal(await Benji.decryptJson("nope", fromApp), null);
  const tampered = Object.assign({}, fromApp, { ct: b64e(b64d(fromApp.ct).map((b, i) => (i === 0 ? b ^ 1 : b))) });
  assert.equal(await Benji.decryptJson("correct horse", tampered), null);
  assert.equal(await Benji.decryptJson("correct horse", { v: 2, salt: fromApp.salt, iv: fromApp.iv, ct: fromApp.ct }), null);
});

test("topic is benji- plus 24 hex chars of SHA-256(benji-topic: + passcode)", async () => {
  const pass = "sample-pass";
  const got = await Benji.topicForPasscode(pass);
  const expect = await independentTopic(pass);
  assert.equal(got, expect);
  assert.match(got, /^benji-[0-9a-f]{24}$/);
});

test("Face ID passcode wrap round-trips and the PRF salt is the documented hash", async () => {
  const salt = await Benji.prfSalt();
  const expectSalt = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("benji-day:face-id:prf:v1")));
  assert.equal(Buffer.from(salt).toString("hex"), Buffer.from(expectSalt).toString("hex"));

  const secret = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await Benji.wrapPasscode(secret, "correct horse");
  assert.equal(wrapped.v, 1);
  assert.equal(b64d(wrapped.iv).length, 12);
  assert.equal(await Benji.unwrapPasscode(secret, wrapped), "correct horse");

  const key = await independentWrapKey(secret, "decrypt");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64d(wrapped.iv) },
    key,
    b64d(wrapped.ct)
  );
  assert.equal(dec.decode(pt), "correct horse");

  const other = crypto.getRandomValues(new Uint8Array(32));
  assert.equal(await Benji.unwrapPasscode(other, wrapped), null);
  assert.equal(await Benji.unwrapPasscode(secret.slice(0, 16), wrapped), null);
});

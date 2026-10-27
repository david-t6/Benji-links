# Benji's Day

Installable iPhone web app for a bright, one-accent daily dashboard (To-do, Inbox, Finances). It is served by GitHub Pages at [https://david-t6.github.io/Benji-links/app/](https://david-t6.github.io/Benji-links/app/).

The root `index.html` in this repo is a separate link hop. This app does not use it. Text and Gmail links open the native apps directly because the page runs at the top level (Safari or the home-screen app).

## Install on an iPhone

1. Open [https://david-t6.github.io/Benji-links/app/](https://david-t6.github.io/Benji-links/app/) in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open Benji's Day from the home screen.
5. Enter the passcode once. It stays on this phone until you tap Settings and Lock.

The app is light only (white background, black text, one green). Add `?demo=1` to the URL to skip the passcode and load the fake sample file instead of the encrypted snapshot.

## What the app loads

| URL | Role |
| --- | --- |
| `data.enc.json` | Hourly snapshot. Fetched with `cache: "no-store"`. Not committed. |
| `data.sample.json` | Unencrypted fake data, same shape. Used only when the URL is `?demo=1`. |

The service worker caches the shell (HTML, CSS, JS, icons, manifest) and uses network-first for `data.enc.json` and `data.sample.json`, falling back to the last cached copy when the phone is offline.

Checked-off items are stored in `localStorage` and also published to ntfy (except in demo mode). Demo ticks use a separate storage key and are never sent.

## Plaintext data shape

`data.enc.json` decrypts to a UTF-8 JSON object. `v` is `1`. Every other key is one of the snapshot variables:

- `UPDATED` string, shown after the date (`"9:41 AM ET"`).
- `DAY_ISO` string `YYYY-MM-DD`. The Now / Up next marker only appears when the phone's local date matches this.
- `DATE_LABEL` string, for example `"Tuesday, October 27"`.
- `schedule` array of `{ start, end, title }`. Hours are decimals (`9.5` is 9:30), sorted by `start`.
- `groups` array of `{ name, waiting, todo }`. Names are Church, Weekday Coffee, Grace & Growth, and Personal. Each task is `{ text, meta?, done?, src? }`. `src` is `{ label, href }` (`Open email`, `Open text`, `Open event`, `Open site`). Omit `src` when there is no real link. Groups with no tasks are hidden.
- `needsReply` and `fyi`: `{ lead, title, meta, detail, sms?, group? }`. `lead` is `Text`, `Church`, `Cafe`, or `Personal`. `detail` may contain `Next: ...`, which is the expanded next step. A title like `(555) 010-0199 (Sam Example)` is shown as `Sam Example`.
- `gmail`: map of lead to `{ name, email }` for Cafe, Church, and Personal.
- `purchases`: `{ lead: "MM/DD", title, detail, meta, pending? }`, newest first. `detail` is the account label (last 4 only). `meta` is the amount, such as `"$12.34"`.
- `byAccount`: `{ label, value, display }`, largest first. Bar width is relative to the max `value`.
- `cash` and `owed`: `{ title, detail?, meta }`.
- `spend`: `{ total, period, count, refunds, refundsDetail, note, footnote }`.
- `skipped`: `{ count, detail }`.

`data.sample.json` is the same object with obviously fake example.com addresses, 555 numbers, and sample amounts. Do not put real account numbers, addresses, or codes in either file.

A to-do id is `group|w|text` (waiting) or `group|t|text` (to-do). An inbox id is `title|meta`. Keep those strings stable across hourly snapshots or the saved tick will not match.

Done state for an item is the newest local or ntfy event for that id, if one exists. Otherwise it is the task's own `done` flag (inbox items are not done unless an event says so).

## Encryption

`data.enc.json` and every ntfy message use the same envelope. `app/crypto.js` is what the page runs. `app/test/roundtrip.js` encrypts with Node's `crypto` and checks that this file decrypts it, then the other way around.

```json
{"v":1,"salt":"<base64>","iv":"<base64>","ct":"<base64>"}
```

- `salt` is 16 random bytes.
- `iv` is 12 random bytes.
- Key is PBKDF2-HMAC-SHA256 of the passcode as UTF-8, salt, **210000** iterations, **32-byte** output.
- Cipher is AES-256-GCM.
- `ct` is the ciphertext with the 16-byte GCM tag appended (WebCrypto's default). There is no separate tag field.
- Base64 is standard RFC 4648 (`+`, `/`, `=` padding), not base64url.
- Plaintext is UTF-8 JSON. The snapshot's own `v` is also `1`.

Node equivalent, which the hourly writer should match:

```js
const crypto = require("crypto");

function encrypt(passcode, obj) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(Buffer.from(String(passcode), "utf8"), salt, 210000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const pt = Buffer.from(JSON.stringify(obj), "utf8");
  const ct = Buffer.concat([cipher.update(pt), cipher.final(), cipher.getAuthTag()]);
  return {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
  };
}
```

The passcode is saved in `localStorage` under `benjis-day:passcode` only after a snapshot decrypts. Lock removes that key and returns to the passcode screen. Ticks stay on the device.

## ntfy events

Topic name:

```text
benji- + first 24 hex characters of SHA-256("benji-topic:" + passcode)
```

Example shape: `benji-0123456789abcdef01234567`.

Each check, uncheck, inbox Done, or Show again publishes one event. The ntfy message body is an envelope (same encryption as above) around this JSON:

```json
{"type":"todo","id":"Church|t|Prepare the example welcome note","text":"Prepare the example welcome note","done":true,"at":"2026-10-27T15:04:05.123Z"}
```

- `type` is `todo` or `inbox`.
- `id` is the stable id above.
- `text` is the task text, or the inbox item's title.
- `done` is `true` or `false`.
- `at` is an ISO-8601 UTC timestamp. The newest `at` wins. An equal `at` keeps the event already stored.

Publish:

```http
POST https://ntfy.sh/<topic>
Content-Type: text/plain; charset=utf-8

{"v":1,"salt":"...","iv":"...","ct":"..."}
```

On load, when the app comes back to the foreground, and when the phone is online again, it reads:

```http
GET https://ntfy.sh/<topic>/json?poll=1&since=12h
```

Each line is an ntfy JSON event. Lines with `event: "message"` are decrypted from `message`. Lines that are not our envelope are ignored. Failed posts sit in `localStorage` (`benjis-day:outbox`, plus `benjis-day:pending` while a key is still being derived) and retry. Demo mode does not call ntfy.

These are the only cross-origin requests. The snapshot fetch stays on this origin.

## Hand-off links

Stored hrefs stay as normal `sms:` and `https:` links. The page converts them at click time.

- `sms:+15555550100` opens that Messages conversation. A group chat is `sms:`.
- `https://mail.google.com/mail/u/?authuser=<email>#all/<threadId>` (or `#inbox/<threadId>`) opens `googlegmail:///cv=<threadId>/accountId=<email>`. If the page is still visible after about 1.2 seconds, it opens the original https link.
- An inbox Reply for an email lead opens `googlegmail://`, then falls back to `https://mail.google.com/mail/u/?authuser=<email>#inbox`.
- Any other `https` link (calendar, vendor, and so on) opens normally.

`threadId` is `[A-Za-z0-9]+`. The email is percent-encoded in `accountId`.

## Local check

From the repo root:

```sh
node app/test/roundtrip.js
python3 -m http.server 8080
```

Open `http://localhost:8080/app/?demo=1` at a phone width. `http://localhost` is a secure context, so WebCrypto works. Opening the files directly from disk will not.

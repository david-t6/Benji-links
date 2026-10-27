# Benji's Day

Installable iPhone web app for today's list, inbox, and spending. It is served by GitHub Pages at [https://david-t6.github.io/Benji-links/app/](https://david-t6.github.io/Benji-links/app/). The hop page at the site root is separate and is not part of this app.

The page is always light: white background, `color-scheme: light`, and a white theme color. Add it to the home screen and it opens standalone, with the default status bar and the safe areas padded in.

## Install

1. Open [https://david-t6.github.io/Benji-links/app/](https://david-t6.github.io/Benji-links/app/) in Safari on the iPhone.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open Benji's Day, enter the passcode, and leave "Use Face ID to unlock" on if you want Face ID next time.

`?demo=1` loads `data.sample.json` instead. That file is fake example data and is not encrypted, so the demo skips the passcode and Face ID.

## Data

`app/data.enc.json` is written hourly by an outside script. It is not in this repo. The app fetches it with `cache: "no-store"` and a `?t=` cache-buster. The service worker treats that file as network-first and falls back to the last cached copy only when the network fails.

The file on disk is an encrypted envelope (below). After decryption the plaintext is UTF-8 JSON, version `v: 1`, whose keys are the dashboard fields:

| Key | Meaning |
| --- | --- |
| `UPDATED` | Snapshot time, shown as "Updated …". Example: `"9:04 AM ET"`. |
| `DAY_ISO` | `YYYY-MM-DD` for the snapshot. The Now marker only shows when the phone's local date matches. |
| `DATE_LABEL` | Heading date, such as `"Tuesday, October 27"`. |
| `schedule` | `{ start, end, title }`. Hours are decimals (`9.5` is 9:30), sorted by start. |
| `groups` | `{ name, waiting, todo }`. Names used by the page: Church, Weekday Coffee, Grace & Growth, Personal. A task is `{ text, meta?, done?, src? }`. `src` is `{ label, href }` (`Open email`, `Open text`, `Open event`, `Open site`). `waiting` items start unchecked. `todo` items may set `done: true`. Empty groups are hidden. |
| `needsReply`, `fyi` | `{ lead, title, meta, detail, sms?, group? }`. `lead` is `Text`, `Church`, `Cafe`, or `Personal`. `meta` is the time on the right. `detail` is a summary, optionally followed by `"Next: …"`. Text rows set `sms` to `+1…`. Group chats set `group: true`. |
| `gmail` | Map of lead to `{ name, email }` for the inbox Gmail buttons. |
| `purchases` | `{ lead, title, detail, meta, pending? }`, newest first. `lead` is `MM/DD`. `detail` is the account (last 4 only). `meta` is the amount. |
| `byAccount` | `{ label, value, display }`, largest first. Bar width is relative to the max `value`. |
| `cash`, `owed` | `{ title, detail?, meta }`. |
| `spend` | `{ total, period, count, refunds, refundsDetail, note, footnote }`. |
| `skipped` | `{ count, detail }`. |

`data.sample.json` is the same object, unencrypted, with obviously fake rows.

Links inside the data stay raw. Text is `sms:+1…` or `sms:` for a group chat. Mail is `https://mail.google.com/mail/u/?authuser=<email>#all/<threadId>` or `#inbox`. The app turns those into native hand-offs at tap time. It does not store hop URLs or `googlegmail://` in the file.

## Encryption

The envelope is JSON, standard base64 (with padding):

```json
{"v":1,"salt":"<base64>","iv":"<base64>","ct":"<base64>"}
```

- `salt` is 16 bytes.
- `iv` is 12 bytes.
- Key is PBKDF2-SHA256 of the passcode as UTF-8, that salt, **210000** iterations, producing AES-256-GCM.
- `ct` is the WebCrypto ciphertext, which is the ciphertext with the 16-byte GCM tag appended.
- The decrypted bytes are UTF-8 JSON as described above.

The same envelope wraps each check-off event before it is posted to ntfy. A wrong passcode or a damaged payload decrypts to nothing and is ignored.

The passcode is not sent to ntfy. It is only used as the PBKDF2 input and in the topic hash below.

## Face ID

After the passcode decrypts for the first time, the app offers **Use Face ID to unlock**. The switch starts on. Continue creates a passkey. Not now (switch off, then Continue) stores the passcode and does not ask again until Settings.

The passkey is WebAuthn:

- Platform authenticator (`authenticatorAttachment: "platform"`).
- `userVerification: "required"` on create and on get.
- `residentKey: "preferred"`.
- Relying party id is `location.hostname`. On the phone that is `david-t6.github.io`.
- ES256 and RS256. Attestation is `none`.
- User id is random. Display name is Benji.

The unlock screen has a large **Unlock with Face ID** button, because iOS often requires a tap before it will show Face ID. **Use passcode instead** is always there. On open, the app also calls `navigator.credentials.get` immediately, before any other await, so a home-screen tap can count as the gesture. If the browser blocks that call, the button stays and no error is shown until a tap fails.

Which mode is stored is decided by the authenticator at enrollment, and written to `localStorage` key `benjis-day:face` as `mode`.

### PRF mode (`mode` is `"prf"`)

Used when registration, or the follow-up `get` in the same setup, returns a 32-byte `extensions.prf.results.first`.

- PRF salt (`extensions.prf.eval.first` on both create and get) is the 32-byte SHA-256 of the UTF-8 string `benji-day:face-id:prf:v1`.
- That 32-byte PRF output is the HKDF input key.
- HKDF-SHA256, salt UTF-8 `benji-day:face-id:hkdf-salt:v1`, info UTF-8 `benji-day:passcode-wrap:v1`, 256-bit AES-GCM key.
- A fresh 12-byte iv. Ciphertext includes the GCM tag, standard base64.
- Stored record: `{ "v": 1, "mode": "prf", "credentialId": "<base64 rawId>", "wrapped": { "v": 1, "iv": "<base64>", "ct": "<base64>" } }`.
- The plaintext passcode is removed from `localStorage`. On open, Face ID evaluates the PRF, unwraps the passcode, then decrypts `data.enc.json`.

Settings says: "Your passcode is locked behind Face ID and isn't stored on this phone."

### UV gate (`mode` is `"uv"`)

Used when the authenticator does not return a PRF result. The passcode stays in `localStorage` under `benjis-day:passcode`. The face record is `{ "v": 1, "mode": "uv", "credentialId": "<base64 rawId>" }` with no `wrapped` field. The app will not decrypt or show the day until `navigator.credentials.get` succeeds with user verification. The assertion's user-verified flag is required when the browser exposes authenticator data.

Settings says: "Face ID checks it's you. Your passcode stays saved on this phone."

Turning the Settings switch off deletes the face record, writes the passcode back into `localStorage`, and remembers that the offer was skipped (`benjis-day:face-offer` = `skip`). **Set up again** creates a new passkey and wraps again, so a phone that gains PRF later can move to PRF mode.

## Check-offs and ntfy

Taps are stored in `localStorage` key `benjis-day:v2` as `{ overrides, queue }` so they survive a reload.

- To-do id: `group|kind|text`. `kind` is `w` for a waiting item and `t` for a to-do. Example: `Church|w|Ask Riley about Sunday start`.
- Inbox id: `title|meta|summary`, where summary is the detail before `Next:`.

An event is plaintext JSON, then encrypted with the envelope above:

```json
{"type":"todo","id":"Church|t|Ask Riley about Sunday start","text":"Ask Riley about Sunday start","done":true,"at":"2026-10-27T15:04:00.000Z"}
```

`type` is `todo` or `inbox`. `at` is an ISO-8601 UTC timestamp. `done` is boolean.

A Sync tap or a pull-to-refresh also posts one extra event, after the queued check-offs:

```json
{"type":"refresh","id":"refresh","at":"2026-10-27T15:04:00.000Z"}
```

That asks the box for a new pass over email, texts, and calendar. It uses the same encrypted envelope. The app sends at most one of these every 2 minutes, and never on the automatic sync that runs when the app opens or comes back to the foreground. When the app reads ntfy, it ignores `type: "refresh"` so it is not applied as a check-off. The box should do the same.

The ntfy topic is `benji-` plus the first 24 hex characters of SHA-256 of the UTF-8 string `benji-topic:` concatenated with the passcode. The app POSTs the envelope as `text/plain` to `https://ntfy.sh/<topic>`. A failed check-off stays in `queue` and is retried on the next sync, when the phone comes online, and when a later tap flushes the queue. A refresh event is not queued. The 2-minute debounce starts only after a successful post, so a failed refresh can be tried again on the next Sync tap.

Sync reads `https://ntfy.sh/<topic>/json?poll=1&since=12h`, decrypts each message body that is an envelope, and merges. The latest `at` wins. An item is done when that latest event says so. If there is no event, a to-do uses its own `done` flag and an inbox row is not done. When a new snapshot's own flag already matches the local override, the override is dropped. An override whose id is gone from the snapshot is dropped too.

## Sync

The header control is a circular-arrows button. It spins while a sync is running, then plays a short check pop. The label is `Updated <UPDATED>` from the snapshot, `Syncing…` while it runs, and `Synced just now` for a minute after a clean sync. If events are still queued it says `Saved on this phone`. If the file could not be fetched it says `Couldn't refresh`.

A sync flushes the queue, re-fetches the data file (cache-busted), polls ntfy, merges, and re-renders. It runs when the app opens, when the page comes back to the foreground, when the Sync button is tapped, and when you pull down from the top of the list.

Only the button and the pull publish a `refresh` event. After that post succeeds, the label reads `Refreshing… new data in a few minutes`. The app then re-fetches `data.enc.json` every 30 seconds for up to 10 minutes. When `UPDATED` changes, the arrows do a small check pop and the label becomes `Updated <time>`.

Halfway, all-done, and inbox-zero confetti run only after a tap crosses that line. Loading and syncing do not fire them.

## Hand-off

These run in the top-level page, not through the hop page.

- `sms:+1…` opens that Messages thread. `sms:` opens Messages. Both are a top-level `location.href` from the tap. There is no web fallback.
- A Gmail thread or inbox URL opens the Gmail app with `googlegmail://`, also by top-level `location.href`. The page does not navigate to `mail.google.com` on its own. If it is still visible about 3 seconds later, a small “Open in browser instead” link appears.
- Any other http(s) link opens in a new tab.

## Shell

`manifest.webmanifest` sets `display: standalone` and a white theme. Icons are `icon-180.png`, `icon-192.png`, and `icon-512.png` (green rounded square, white check). `sw.js` precaches the shell and uses network-first for `data.enc.json` and `data.sample.json`.

## Test

```sh
node --test app/test/crypto.test.cjs
```

That encrypts a sample with an independent PBKDF2/AES-GCM implementation and with `crypto.js`, checks both directions, checks the topic hash, and round-trips the Face ID passcode wrap.

# Benji links

A one-page hop for [GitHub Pages](https://david-t6.github.io/Benji-links/). A dashboard opens this address with the instruction in the URL hash. The fragment is never sent to the server. On an iPhone the page hands off to Messages or the Gmail app.

Nothing here phones home: no analytics, no extra requests, and no query string.

## Hash formats

Open a Messages conversation:

```
https://david-t6.github.io/Benji-links/#sms=+14075551234
```

`%2B` is fine too: `#sms=%2B14075551234`.

Open the Messages app with no conversation:

```
https://david-t6.github.io/Benji-links/#sms=
```

Open the Gmail app. The page does not jump to Gmail on the web. If it is still showing after about 3 seconds, an “Open in browser instead” link appears.

```
https://david-t6.github.io/Benji-links/#gmail=18c0a1b2c3d4e5f6&acct=benji%40gmail.com
```

A literal `@` works as well: `#gmail=18c0a1b2c3d4e5f6&acct=benji@gmail.com`.

Open the Gmail app. The browser link, if you tap it, goes to that account’s inbox:

```
https://david-t6.github.io/Benji-links/#gmail=&acct=benji%40gmail.com
```

Go straight to an `http` or `https` address (the value is encoded):

```
https://david-t6.github.io/Benji-links/#url=https%3A%2F%2Fexample.com%2Fhello
```

Anything else stays on the page and shows “Nothing to open”.

## What is accepted

- `sms` is empty, or only digits and `+`.
- `gmail` is empty, or only letters and digits (`A-Za-z0-9`). `acct` has to look like an email.
- `url` must decode to an `http` or `https` address.

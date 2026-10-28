#!/bin/bash
# Benji's Day old-Mac text pusher installer. Contains no secrets. Usage: bash -c "$(curl -fsSL <url>)"
CHECK="41d580bd"
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
umask 077
D="$HOME/.benji"; mkdir -p "$D"; chmod 700 "$D"
sha() { printf '%s' "$1" | /usr/bin/openssl dgst -sha256 | awk '{print $NF}'; }
echo "Benji's Day text sync installer"
for try in 1 2 3; do
  printf "Type the Benji app passcode (nothing will show as you type), then press Return: "
  IFS= read -rs PW < /dev/tty; echo
  [ "$(sha "benji-imsg-check:$PW" | cut -c1-8)" = "$CHECK" ] && break
  echo "That passcode doesn't match. Try again."; PW=""
done
[ -n "$PW" ] || { echo "RESULT: FAILED - passcode not accepted."; exit 1; }
printf '%s\n' "$PW" > "$D/passcode"; chmod 600 "$D/passcode"
TOPIC="benji-imsg-$(sha "benji-imsg-topic:$PW" | cut -c1-24)"; PW=""
if echo x | /usr/bin/openssl enc -aes-256-cbc -pbkdf2 -iter 1000 -md sha256 -pass pass:x >/dev/null 2>&1; then KDF=pbkdf2; else KDF=legacy; fi
printf 'TOPIC=%s\nKDF=%s\nITER=200000\nHOURS=96\n' "$TOPIC" "$KDF" > "$D/config"; chmod 600 "$D/config"
cat > "$D/push.sh" <<'PUSH'
#!/bin/bash
# Benji's Day: push recent iMessages/SMS from this Mac (encrypted) to the Benji box. No secrets in this file.
# Reads ~/.benji/passcode (chmod 600) and ~/.benji/config. Runs hourly from ~/Library/LaunchAgents/com.benji.imsg.plist.
export TZ=America/New_York PATH=/usr/bin:/bin:/usr/sbin:/sbin
umask 077
D="$HOME/.benji"; . "$D/config" || { echo "$(date) FAIL: no config"; exit 1; }
HOURS="${HOURS:-96}"
DB="$HOME/Library/Messages/chat.db"
TMP="$(mktemp -d /tmp/benji.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
if ! /usr/bin/sqlite3 -readonly "$DB" "select 1;" >/dev/null 2>"$TMP/err"; then
  echo "$(date) FAIL: cannot read Messages database (Full Disk Access for /bin/bash missing?): $(head -c 200 "$TMP/err")"
  exit 2
fi
Q="SELECT 'M', datetime(m.date/1000000000+978307200,'unixepoch','localtime'), m.is_from_me,
 hex(COALESCE(h.id,'')), hex(COALESCE(c.display_name,'')), hex(COALESCE(c.chat_identifier,'')),
 hex(COALESCE(m.text,'')), CASE WHEN m.text IS NULL OR m.text='' THEN hex(m.attributedBody) ELSE '' END
FROM message m LEFT JOIN handle h ON h.ROWID=m.handle_id
LEFT JOIN chat_message_join cmj ON cmj.message_id=m.ROWID LEFT JOIN chat c ON c.ROWID=cmj.chat_id
WHERE m.date/1000000000+978307200 > strftime('%s','now') - $HOURS*3600 AND m.associated_message_type=0
ORDER BY m.date;"
/usr/bin/sqlite3 -readonly -separator '|' -cmd '.timeout 10000' "$DB" "$Q" > "$TMP/rows" 2>"$TMP/err" || {
  echo "$(date) FAIL: query error: $(head -c 200 "$TMP/err")"; exit 3; }
N=$(wc -l < "$TMP/rows" | tr -d ' ')
# Contacts (best effort): phone/email -> name
: > "$TMP/contacts"
for AB in "$HOME/Library/Application Support/AddressBook/AddressBook-v22.abcddb" "$HOME/Library/Application Support/AddressBook/Sources/"*/AddressBook-v22.abcddb; do
  [ -f "$AB" ] || continue
  /usr/bin/sqlite3 -readonly -separator '|' "$AB" "
   SELECT 'C', hex(p.ZFULLNUMBER), hex(TRIM(COALESCE(r.ZFIRSTNAME,'')||' '||COALESCE(r.ZLASTNAME,''))), hex(COALESCE(r.ZORGANIZATION,''))
     FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON r.Z_PK=p.ZOWNER WHERE p.ZFULLNUMBER IS NOT NULL;
   SELECT 'C', hex(e.ZADDRESS), hex(TRIM(COALESCE(r.ZFIRSTNAME,'')||' '||COALESCE(r.ZLASTNAME,''))), hex(COALESCE(r.ZORGANIZATION,''))
     FROM ZABCDEMAILADDRESS e JOIN ZABCDRECORD r ON r.Z_PK=e.ZOWNER WHERE e.ZADDRESS IS NOT NULL;" >> "$TMP/contacts" 2>/dev/null || true
done
C=$(wc -l < "$TMP/contacts" | tr -d ' ')
{ echo "#BENJI-IMSG v1|$(date +%Y-%m-%dT%H:%M:%S%z)|$HOURS|$N|$C|$(scutil --get ComputerName 2>/dev/null | tr -d '|')"
  cat "$TMP/rows" "$TMP/contacts"; } | /usr/bin/gzip -c > "$TMP/p.gz"
if [ "$KDF" = "pbkdf2" ]; then KF="-pbkdf2 -iter $ITER"; NAME="imsg-pbkdf2-$ITER.bin"; else KF=""; NAME="imsg-legacy.bin"; fi
/usr/bin/openssl enc -aes-256-cbc -salt -md sha256 $KF -pass "file:$D/passcode" -in "$TMP/p.gz" -out "$TMP/p.bin" || {
  echo "$(date) FAIL: encrypt error"; exit 4; }
R=$(/usr/bin/curl -sS --max-time 120 --retry 3 -T "$TMP/p.bin" -H "Filename: $NAME" "https://ntfy.sh/$TOPIC" 2>&1)
case "$R" in *'"attachment"'*) echo "$(date) OK: sent $N messages, $C contact entries ($(wc -c < "$TMP/p.bin" | tr -d ' ') bytes)";;
  *) echo "$(date) FAIL: upload error: $(printf '%s' "$R" | head -c 200)"; exit 5;; esac
PUSH
chmod 700 "$D/push.sh"
PL="$HOME/Library/LaunchAgents/com.benji.imsg.plist"; mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PL" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>com.benji.imsg</string>
 <key>ProgramArguments</key><array><string>/bin/bash</string><string>$D/push.sh</string></array>
 <key>StartCalendarInterval</key><dict><key>Minute</key><integer>50</integer></dict>
 <key>RunAtLoad</key><true/>
 <key>StandardOutPath</key><string>$D/push.log</string>
 <key>StandardErrorPath</key><string>$D/push.log</string>
</dict></plist>
PLIST
chmod 644 "$PL"
: >> "$D/push.log"; START=$(wc -l < "$D/push.log")
launchctl unload "$PL" 2>/dev/null; launchctl load -w "$PL"
echo "Installed. Running the first sync (up to 2 minutes)..."
for i in $(seq 1 60); do
  L=$(tail -n +$((START+1)) "$D/push.log" | grep -E ' (OK|FAIL):' | tail -1)
  [ -n "$L" ] && break; sleep 2
done
case "$L" in
  *" OK:"*) echo "RESULT: SUCCESS - $L"; echo "It will now send texts every hour at :50.";;
  *"Full Disk Access"*) echo "RESULT: FAILED - Full Disk Access is missing for /bin/bash. Add it (see the steps), then run this same command again.";;
  "") echo "RESULT: FAILED - no result after 2 minutes. Log: $D/push.log";;
  *) echo "RESULT: FAILED - $L";;
esac

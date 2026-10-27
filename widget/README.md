# Benji's Day widget

A Scriptable widget for the iPhone Home Screen. It reads the same encrypted snapshot as the app, shows how many to-dos are open and done, the next thing on the calendar, and (on the large widget) the next few open to-dos. A tap opens [Benji's Day](https://david-t6.github.io/Benji-links/app/).

The passcode is asked for once, when you run the script inside Scriptable, and is stored in the iOS Keychain. It is not in this file. The mark at the top is the app icon, a golden sun with a white check, saved on the phone after the first load.

## Install

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) from the App Store.
2. On the iPhone, open the raw script: https://raw.githubusercontent.com/david-t6/Benji-links/main/widget/benjis-day-widget.js
3. Select all of it, copy, then in Scriptable tap the plus button and paste it into a new script named **Benji's Day**.
4. Run the script once and enter your passcode when asked. That saves it in the Keychain.
5. Long-press the Home Screen, tap the plus button, choose Scriptable, pick small, medium, or large, then choose the **Benji's Day** script.

The widget refreshes about every 30 minutes. The last day it could decrypt stays on the phone, so it still shows something when you are offline.

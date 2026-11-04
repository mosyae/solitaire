# Solitaire

Classic Klondike solitaire for Android. **No ads, no tracking, no internet permission** — fully offline.

## Install on your phone

1. On your Android phone open **https://github.com/mosyae/solitaire/releases/latest/download/Solitaire.apk**
2. Open the downloaded file and tap **Install** (allow "Install unknown apps" for your browser if asked).
3. To update later, download the newest APK the same way and install over the old one — your saved game and stats stay.

You can also play in a browser: **https://mosyae.github.io/solitaire/**

## Features

- Tap a card to auto-move it to the best spot, or drag cards/stacks
- Draw 1 / Draw 3 (Menu)
- Unlimited undo, hints, auto-finish, Windows-style scoring + time bonus
- Game is saved automatically — close the app and continue later
- Stats: games played/won, best time, best score, streaks

## Project layout

- `web/` – the game (HTML/CSS/JS). Open `web/index.html` in a browser to play/test.
- `app/` – a small Android WebView wrapper that bundles `web/` as assets.
- `.github/workflows/build.yml` – on every push to `main`, builds the signed APK and publishes it as a GitHub Release, and deploys `web/` to GitHub Pages.

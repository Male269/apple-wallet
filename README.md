**Pocket Demo** is the current, clearly labeled image viewer in `demo/`. It runs locally on an iPhone after a one-time online installation. Every displayed card is marked **DEMO · NOT VALID FOR ENTRY**. Imported copies also have the label rendered into their image data.

Tap **+** to import images, tap a card to open it, swipe left or right to browse, and pull down to close. Short or cancelled drags spring back. Options let you rename a card, choose contain/fill, or remove it with a ten-second undo. Light, dark, and automatic themes are saved. The collection scrolls normally, including native touch scrolling on iPhone.

**Preview on this PC**

From this folder, run:

```powershell
npm start
```

Open [the local demo](http://localhost:4173/). The server binds only to this PC and serves an explicit list of demo files. The old root `index.html`, template, and `build.ps1` belong to the legacy implementation. Use the files in `demo/` for the new app.

**Install on iPhone**

The new demo has not yet been published. Its files must first be served by an HTTPS website. Only the files generated in `demo-dist/` belong in that deployment.

1. While online, open the deployed demo URL in Safari.
2. Choose **Share → Add to Home Screen**, enable **Open as Web App** if offered, and tap **Add**. [Apple's instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).
3. Open the new **Pocket Demo** icon while still online and wait for **Ready offline**.
4. Import your images inside that installed app. Safari and the Home Screen app can have separate storage, so do not assume images added in a browser tab will transfer.
5. Turn on Airplane Mode, turn Wi-Fi off, close and reopen Pocket Demo, and verify the images and gestures. After the first installation, the app shell and saved images are designed to work without a connection. Service workers supply the offline app shell. [WebKit's explanation](https://webkit.org/blog/8090/workers-at-your-service/).

Opening an HTML file from Files or visiting an ordinary HTTP LAN address does not establish the service-worker setup required here. The app reports when offline installation is unavailable.

Images are processed on the device and stored as JPEG bytes in IndexedDB. There is no image upload endpoint, analytics, external font, or runtime CDN dependency. Imports accept up to 20 images at once, up to 60 cards total, and files under 25 MB; large images are resized to a maximum side of 1600 pixels. Unsupported or damaged images produce an error. HEIC support depends on the browser; use JPEG or PNG if decoding fails. Keep the original files: removing the app, clearing website data, or storage eviction can remove the saved collection.

**Build and validate**

```powershell
npm ci
npx playwright install chromium webkit
npm test
npm run test:restart
npm run build
```

The build copies exactly eight runtime assets into `demo-dist/` and creates `SHA256SUMS.txt`. It refuses unexpected files in the output directory. Do not publish the whole repository: it contains legacy screenshot and embedded image assets. The existing public `Male269/apple-wallet` repository and its old Pages deployment have not been changed.

The automated browser checks cover image import, rename and fit persistence, themes, cancelled/short/long gestures, horizontal browsing, deletion and undo, invalid images, offline reload and window reopening, small and landscape viewports, and empty-state persistence. They also check that no external request or image upload occurs. The restart test closes the entire browser process, stops the server, and then verifies that an imported image is restored after relaunch. Results and screenshots are written to `test-results/`. These checks passed on Chromium 151.0.7922.34 and WebKit 26.6 on Windows. WebKit on Windows is useful compatibility evidence, but it is not a physical iPhone test.

For offline tests, the local web server is actually stopped. Chromium additionally uses browser offline mode; the Windows WebKit automation adapter reports an internal navigation error with that setting, so its test uses the stopped origin instead.

The project lives in Documents and is covered by the existing automatic backup task.

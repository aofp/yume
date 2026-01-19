# yume-io

github pages site for yume - the claude code gui.

## structure

```
yume-io/
├── index.html          # main landing page with payment redirect
├── assets/
│   └── yume.png        # logo (copy from yume project)
├── releases/
│   ├── releases.json   # release manifest
│   └── *.dmg/msi/etc   # release binaries
└── README.md
```

## release workflow

1. build release in ~/yume:
   ```bash
   npm run tauri:build:mac:arm64
   npm run tauri:build:mac:x64
   npm run tauri:build:win
   npm run tauri:build:linux
   ```

2. copy binaries to releases/:
   ```bash
   cp ~/yume/src-tauri/target/*/release/bundle/dmg/*.dmg releases/
   cp ~/yume/src-tauri/target/release/bundle/msi/*.msi releases/
   cp ~/yume/src-tauri/target/release/bundle/appimage/*.AppImage releases/
   ```

3. update releases/releases.json with new version

4. commit and push to github

5. github pages will serve the site at yuruko.github.io/yume-io

## payment flow

payments are processed on yuru.be (heroku) which has paypal integration.
the github io site redirects to yuru.be/yume#pricing for purchases.
license keys are generated and validated by yuru.be/api/license/*.

## setup

1. create github repo: yuruko/yume-io
2. enable github pages (settings > pages > deploy from main branch)
3. copy yume.png to assets/
4. push initial commit

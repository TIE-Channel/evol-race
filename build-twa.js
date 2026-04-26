name: Build Android APK

on:
  push:
    branches: [main]
    paths:
      - 'manifest.webmanifest'
      - 'index.html'
      - 'sw.js'
      - 'icon-*.png'
      - '.github/workflows/build-apk.yml'
      - 'twa-manifest.json'
      - 'build-twa.js'
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: 'platforms;android-34 build-tools;34.0.0 platform-tools'

      - name: Wait for GitHub Pages deploy
        run: |
          echo "Waiting 60 seconds for GitHub Pages to deploy..."
          sleep 60

      - name: Verify PWA URLs are accessible
        run: |
          set -e
          echo "Checking PWA endpoints..."
          for url in \
            "https://tie-channel.github.io/evolrace/" \
            "https://tie-channel.github.io/evolrace/manifest.webmanifest" \
            "https://tie-channel.github.io/evolrace/icon-512.png" \
            "https://tie-channel.github.io/evolrace/icon-maskable.png"; do
            echo "Checking: $url"
            curl -sSfL -o /dev/null -w "  HTTP %{http_code} - %{size_download} bytes\n" "$url" || \
              echo "  WARNING: $url failed"
          done

      - name: Install @bubblewrap/core
        run: |
          npm init -y
          npm install @bubblewrap/core@latest --save

      - name: Print bubblewrap version
        run: |
          node -e "const pkg = require('@bubblewrap/core/package.json'); console.log('@bubblewrap/core version:', pkg.version);"

      - name: Generate TWA Android Project
        run: node build-twa.js

      - name: List Android project structure
        run: |
          echo "=== android-project structure ==="
          find android-project -maxdepth 3 -type f 2>/dev/null | head -30 || echo "No project dir!"
          echo ""
          echo "=== Looking for gradlew ==="
          find android-project -name "gradlew" -type f 2>/dev/null

      - name: Generate signing keystore
        run: |
          keytool -genkeypair \
            -dname "cn=Evolrace, ou=Apps, o=TieChannel, c=US" \
            -alias evolrace \
            -keypass android \
            -keystore android-project/android.keystore \
            -storepass android \
            -validity 20000 \
            -keyalg RSA \
            -keysize 2048

      - name: Print signing key SHA-256 fingerprint
        run: |
          echo "=== SHA-256 fingerprint for assetlinks.json ==="
          keytool -list -v \
            -keystore android-project/android.keystore \
            -alias evolrace \
            -storepass android \
            -keypass android | grep -E "SHA256:" | head -1

      - name: Build APK with Gradle
        working-directory: android-project
        run: |
          chmod +x gradlew
          ./gradlew assembleRelease bundleRelease \
            -Pandroid.injected.signing.store.file=$(pwd)/android.keystore \
            -Pandroid.injected.signing.store.password=android \
            -Pandroid.injected.signing.key.alias=evolrace \
            -Pandroid.injected.signing.key.password=android \
            --stacktrace --no-daemon

      - name: List generated artifacts
        run: |
          echo "=== Generated APKs ==="
          find android-project -name "*.apk" -type f
          echo ""
          echo "=== Generated AABs ==="
          find android-project -name "*.aab" -type f

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: evolrace-apk
          path: android-project/app/build/outputs/apk/release/*.apk
          if-no-files-found: warn
          retention-days: 30

      - name: Upload AAB
        uses: actions/upload-artifact@v4
        with:
          name: evolrace-aab
          path: android-project/app/build/outputs/bundle/release/*.aab
          if-no-files-found: warn
          retention-days: 30

      - name: Generate assetlinks.json
        if: always()
        run: |
          FINGERPRINT=$(keytool -list -v \
            -keystore android-project/android.keystore \
            -alias evolrace \
            -storepass android \
            -keypass android 2>/dev/null | grep -E "SHA256:" | head -1 | awk '{print $2}' || echo "")

          if [ -n "$FINGERPRINT" ]; then
            cat > assetlinks.json << ASSETLINK
          [{
            "relation": ["delegate_permission/common.handle_all_urls"],
            "target": {
              "namespace": "android_app",
              "package_name": "io.github.tiechannel.evolrace",
              "sha256_cert_fingerprints": ["$FINGERPRINT"]
            }
          }]
          ASSETLINK
            echo "assetlinks.json created with fingerprint: $FINGERPRINT"
            cat assetlinks.json
          else
            echo "Warning: no fingerprint extracted"
          fi

      - name: Upload assetlinks.json
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: assetlinks-json
          path: assetlinks.json
          if-no-files-found: warn

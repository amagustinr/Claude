#!/bin/bash
set -e
cd "$(dirname "$0")"
SDK=/usr/lib/android-sdk/platforms/android-23/android.jar
rm -rf build && mkdir -p build/gen build/obj build/apk
aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -A assets -I $SDK -F build/apk/unsigned.apk
javac -source 8 -target 8 -bootclasspath $SDK -classpath $SDK -d build/obj build/gen/com/alexander/panelled/R.java src/com/alexander/panelled/*.java 2>&1 | grep -v "warning: \[options\]" || true
/usr/lib/android-sdk/build-tools/debian/dx --dex --output=build/apk/classes.dex build/obj
(cd build/apk && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 build/apk/unsigned.apk build/apk/aligned.apk
[ -f release.keystore ] || keytool -genkeypair -keystore release.keystore -alias panelled -keyalg RSA -keysize 2048 -validity 10000 -storepass panelled123 -keypass panelled123 -dname "CN=Panel LED, O=Alexander, C=PE" >/dev/null 2>&1
apksigner sign --ks release.keystore --ks-pass pass:panelled123 --ks-key-alias panelled --out build/PanelLED.apk build/apk/aligned.apk
apksigner verify -v build/PanelLED.apk | head -5
ls -la build/PanelLED.apk

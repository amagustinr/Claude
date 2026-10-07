#!/usr/bin/env bash
# Compila MesaDeDados.apk sin Gradle, con las herramientas del Android SDK
# (en Ubuntu: apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 default-jdk).
# Firma con dados.keystore; si no existe, crea una nueva. La clave se toma de KS_PASS.
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
BT=$(ls -d $SDK/build-tools/* | head -1)
JAR=$SDK/platforms/android-23/android.jar
KS_PASS=${KS_PASS:?Define KS_PASS con la clave del keystore}

if [ ! -f dados.keystore ]; then
  keytool -genkeypair -keystore dados.keystore -alias dados -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Mesa de Dados"
fi

rm -rf gen build; mkdir -p gen build/classes
aapt package -f -m -J gen -M AndroidManifest.xml -S res -I $JAR
javac --release 8 -nowarn -classpath $JAR -d build/classes gen/pe/alexander/dados/R.java src/pe/alexander/dados/MainActivity.java
$BT/dx --dex --output=build/classes.dex build/classes
aapt package -f -M AndroidManifest.xml -S res -A assets -I $JAR -F build/unsigned.apk
(cd build && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f 4 build/unsigned.apk build/aligned.apk
apksigner sign --ks dados.keystore --ks-pass pass:"$KS_PASS" --key-pass pass:"$KS_PASS" --out build/MesaDeDados.apk build/aligned.apk
apksigner verify build/MesaDeDados.apk && echo "Listo: build/MesaDeDados.apk"

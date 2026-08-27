import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const gradlePath = join(process.cwd(), "node_modules/react-native-sherpa-onnx/android/build.gradle");
const source = await readFile(gradlePath, "utf8");

const bundledBuildscript = `buildscript {
  ext.SherpaOnnx = [
    kotlinVersion: "2.0.21",
    minSdkVersion: 24,
    compileSdkVersion: 36,
    targetSdkVersion: 36
  ]

  ext.getExtOrDefault = { prop ->
    if (rootProject.ext.has(prop)) {
      return rootProject.ext.get(prop)
    }

    return SherpaOnnx[prop]
  }

  repositories {
    google()
    mavenCentral()
    maven { url 'https://plugins.gradle.org/m2/' }
  }

  dependencies {
    classpath "com.android.tools.build:gradle:8.7.2"
    // noinspection DifferentKotlinGradleVersion
    classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:\${getExtOrDefault('kotlinVersion')}"
    // Node Gradle plugin for running node/npx reliably from Gradle
    classpath "com.github.node-gradle:gradle-node-plugin:7.1.0"
  }
}`;

const expoAlignedBuildscript = `def SherpaOnnx = [
  minSdkVersion: 24,
  compileSdkVersion: 36,
  targetSdkVersion: 36,
]

def getExtOrDefault = { prop ->
  if (rootProject.ext.has(prop)) {
    return rootProject.ext.get(prop)
  }
  return SherpaOnnx[prop]
}`;

let patched = source;
if (patched.includes(bundledBuildscript)) {
  patched = patched.replace(bundledBuildscript, expoAlignedBuildscript);
}
patched = patched.replace(
  'implementation "com.facebook.react:react-android:0.83.0"',
  'compileOnly "com.facebook.react:react-android"',
);

if (!patched.includes('compileOnly "com.facebook.react:react-android"')) {
  throw new Error("Không thể áp dụng bản vá react-android cho Sherpa-ONNX.");
}
if (patched.includes('classpath "com.android.tools.build:gradle:8.7.2"')) {
  throw new Error("Không thể gỡ Android Gradle Plugin cục bộ khỏi Sherpa-ONNX.");
}

await writeFile(gradlePath, patched);
console.log("Sherpa-ONNX Gradle đã được đồng bộ với toolchain Expo.");

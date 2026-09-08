import java.util.Properties

plugins {
    alias(libs.plugins.worktrack.android.application)
    alias(libs.plugins.worktrack.android.hilt)
}

// ---------------------------------------------------------------- signing
//
// The release signing key is the one artefact in this project that cannot be
// replaced: lose it and this app can never be updated again; leak it and
// someone else can sign a build as us. So nothing about it lives in the repo.
//
// Values come from keystore.properties at the repo root (gitignored), or from
// Gradle properties so CI can inject them without a file. Create the key once:
//
//   keytool -genkeypair -v -keystore worktrack-release.jks \
//     -alias worktrack -keyalg RSA -keysize 4096 -validity 10000
//
// then copy keystore.properties.example to keystore.properties and fill it in.
// Back the .jks up somewhere you will still have in five years.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

fun signingValue(fileKey: String, gradleProperty: String): String? =
    keystoreProperties.getProperty(fileKey) ?: project.findProperty(gradleProperty) as String?

val releaseStorePath = signingValue("storeFile", "worktrack.storeFile")
val releaseStoreFile = releaseStorePath?.let(rootProject::file)
val hasReleaseKey = releaseStoreFile?.exists() == true

// Signing a release with the DEBUG key, on purpose, to smoke-test that R8 has
// not stripped something the app needs at runtime. An APK signed this way must
// never reach a user, so it takes an explicit flag:
//   ./gradlew :app:assembleRelease -Pworktrack.debugSignRelease
val debugSignRelease = project.hasProperty("worktrack.debugSignRelease")

// API endpoints per environment, kept together so it is obvious at a glance
// which build talks to which backend.
val productionApiBaseUrl = "https://worktrack-prod.web.app/v1/"

// 10.0.2.2 is the host machine's loopback as seen from an Android emulator.
val emulatorApiBaseUrl = "http://10.0.2.2:5001/demo-worktrack/us-central1/api/v1/"

// A debug build talks to the LOCAL emulator unless told otherwise, so everyday
// development cannot read or write a real company's data by accident. To point
// a debug build somewhere else on purpose:
//   ./gradlew :app:assembleDebug -Pworktrack.apiBaseUrl=https://worktrack-prod.web.app/v1/
// or persist it in gradle.properties (project or ~/.gradle/):
//   worktrack.apiBaseUrl=https://worktrack-prod.web.app/v1/
val debugApiBaseUrl =
    (project.findProperty("worktrack.apiBaseUrl") as String?) ?: emulatorApiBaseUrl

android {
    namespace = "app.worktrack"

    defaultConfig {
        applicationId = "app.worktrack"
        // 1.0.1 carries the location-permission fix: 1.0.0 asked for
        // ACCESS_FINE_LOCATION alone, which Android 12 and newer drop outright
        // from an app targeting SDK 31+, so GPS check-in could never get
        // permission. Do not ship 1.0.0 to anyone.
        versionCode = 2
        versionName = "1.0.1"

        // Inherited by the release build: Firebase Hosting rewrites /v1/** to
        // the `api` Cloud Function (see backend/firebase.json), a stable URL
        // that matches the web portal. Swap for a custom domain (e.g.
        // worktrack.af) once you connect one in Hosting. The debug build type
        // overrides both of these below.
        buildConfigField("String", "API_BASE_URL", "\"$productionApiBaseUrl\"")
        buildConfigField("boolean", "USE_EMULATORS", "false")
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = signingValue("storePassword", "worktrack.storePassword")
                keyAlias = signingValue("keyAlias", "worktrack.keyAlias")
                keyPassword = signingValue("keyPassword", "worktrack.keyPassword")

                // v1 (JAR signing) is for Android 6 and older; minSdk is 26, so
                // it only adds size and build time. v3 carries the proof needed
                // to rotate to a new signing key later without every user having
                // to reinstall — cheap now, impossible to add retroactively.
                enableV1Signing = false
                enableV2Signing = true
                enableV3Signing = true
            }
        }
    }

    buildTypes {
        /*
         * The public demo build.
         *
         * A separate applicationId is the whole point: without it, installing
         * the demo would REPLACE the real app on the phone of anyone who
         * already runs WorkTrack, taking their queued offline punches with it.
         * With the suffix the two sit side by side.
         *
         * It is a build type rather than a product flavor deliberately — a
         * flavor renames every existing variant task (compileDebugKotlin
         * becomes compileProductionDebugKotlin), which would break CI and every
         * command in the docs. A build type only adds `assembleDemo`.
         *
         * Firebase config comes from app/src/demo/google-services.json, which
         * points at worktrack-demo-af, so Auth and the API agree about which
         * backend they are talking to.
         */
        create("demo") {
            initWith(getByName("release"))
            applicationIdSuffix = ".demo"
            versionNameSuffix = "-demo"
            // Library modules only define debug/release; without this the demo
            // build type has nothing to resolve against in them.
            matchingFallbacks += listOf("release")

            buildConfigField("String", "API_BASE_URL", "\"https://demo.linumic.com/v1/\"")
            buildConfigField("boolean", "USE_EMULATORS", "false")

            signingConfig = when {
                hasReleaseKey -> signingConfigs.getByName("release")
                debugSignRelease -> signingConfigs.getByName("debug")
                else -> null
            }
        }

        release {
            // R8 and resource shrinking are already on from the convention
            // plugin; this only decides what the output gets signed with.
            signingConfig = when {
                hasReleaseKey -> signingConfigs.getByName("release")
                debugSignRelease -> signingConfigs.getByName("debug")
                else -> null
            }
        }

        debug {
            // Debug used to point at the LIVE worktrack-prod backend, so anyone
            // who installed a development build was writing to a real company's
            // attendance and payroll. It now defaults to the local emulator;
            // see debugApiBaseUrl above for the deliberate override.
            //
            // The applicationId stays "app.worktrack" (no suffix) so it keeps
            // matching the client in google-services.json. Cleartext to the
            // emulator is already permitted by the debug source set — see
            // app/src/debug/res/xml/network_security_config.xml.
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")

            // Firebase Auth has to follow the API: authenticating against
            // production while calling the emulator (or the reverse) issues
            // tokens the other side cannot verify.
            buildConfigField(
                "boolean",
                "USE_EMULATORS",
                (debugApiBaseUrl == emulatorApiBaseUrl).toString(),
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    /*
     * One APK per CPU architecture instead of one carrying all four.
     *
     * The TensorFlow Lite and ML Kit native libraries dominate the download,
     * and a universal APK ships every architecture to every phone: roughly
     * 40 MB of x86 that only an emulator will ever load. On the connections
     * this app is installed over, that is the difference between a download
     * that finishes and one that does not.
     *
     * The universal APK is still produced, for the emulator and as a fallback
     * when the target device is unknown.
     */
    splits {
        abi {
            isEnable = true
            reset()
            include("armeabi-v7a", "arm64-v8a", "x86_64")
            isUniversalApk = true
        }
    }
}

dependencies {
    implementation(projects.feature.auth)
    implementation(projects.feature.dashboard)
    implementation(projects.feature.attendance)
    implementation(projects.feature.leave)
    implementation(projects.feature.payslips)
    implementation(projects.feature.profile)

    implementation(projects.core.common)
    implementation(projects.core.model)
    implementation(projects.core.domain)
    implementation(projects.core.data)
    implementation(projects.core.sync)
    implementation(projects.core.network)
    implementation(projects.core.designsystem)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.androidx.compose.material.icons)

    implementation(libs.androidx.work.runtime)
    implementation(libs.hilt.ext.work)
    ksp(libs.hilt.ext.compiler)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)

    androidTestImplementation(libs.androidx.test.ext)
    androidTestImplementation(libs.androidx.test.runner)
}

// google-services.json is environment-specific and never committed; the plugin
// is applied only when the file is present so CI and fresh clones still build.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

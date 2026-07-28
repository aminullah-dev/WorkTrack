plugins {
    alias(libs.plugins.worktrack.android.application)
    alias(libs.plugins.worktrack.android.hilt)
}

android {
    namespace = "app.worktrack"

    defaultConfig {
        applicationId = "app.worktrack"
        versionCode = 1
        versionName = "1.0.0"

        // Per-environment API endpoints are configured through build types below.
        // Release goes through Firebase Hosting, which rewrites /v1/** to the
        // `api` Cloud Function (see backend/firebase.json) — a stable URL that
        // matches the web portal. Swap for a custom domain (e.g. worktrack.af)
        // once you connect one in Hosting.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"https://worktrack-prod.web.app/v1/\"",
        )
        // Production builds use real Firebase; debug overrides to the emulator.
        buildConfigField("boolean", "USE_EMULATORS", "false")
    }

    buildTypes {
        debug {
            // Debug points at the LIVE worktrack-prod backend so it can be Run
            // straight onto a device/emulator — no signing, no local emulators.
            // The applicationId stays "app.worktrack" (no suffix) to match the
            // client in google-services.json.
            //
            // To test against the LOCAL Firebase Emulator Suite instead, restore:
            //   applicationIdSuffix = ".debug"   // and register that package in Firebase
            //   API_BASE_URL = "http://10.0.2.2:5001/demo-worktrack/us-central1/api/v1/"
            //   USE_EMULATORS = true
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"https://worktrack-prod.web.app/v1/\"",
            )
            buildConfigField("boolean", "USE_EMULATORS", "false")
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

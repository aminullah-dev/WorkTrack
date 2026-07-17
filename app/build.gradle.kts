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
        buildConfigField("String", "API_BASE_URL", "\"https://api.worktrack.app/v1/\"")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            buildConfigField(
                "String",
                "API_BASE_URL",
                // Firebase emulator suite / local functions host from an emulator.
                "\"http://10.0.2.2:5001/worktrack-dev/us-central1/api/v1/\"",
            )
        }
    }

    buildFeatures {
        buildConfig = true
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

plugins {
    alias(libs.plugins.worktrack.android.library)
    alias(libs.plugins.worktrack.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "app.worktrack.core.network"
}

dependencies {
    implementation(projects.core.common)
    implementation(projects.core.model)

    implementation(libs.kotlinx.coroutines.android)
    api(libs.kotlinx.serialization.json)
    api(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging)
}

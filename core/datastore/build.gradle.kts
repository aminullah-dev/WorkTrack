plugins {
    alias(libs.plugins.worktrack.android.library)
    alias(libs.plugins.worktrack.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "app.worktrack.core.datastore"
}

dependencies {
    implementation(projects.core.common)
    implementation(projects.core.model)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
}

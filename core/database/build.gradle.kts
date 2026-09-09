plugins {
    alias(libs.plugins.worktrack.android.library)
    alias(libs.plugins.worktrack.android.hilt)
    alias(libs.plugins.worktrack.android.room)
}

android {
    namespace = "app.worktrack.core.database"
}

dependencies {
    implementation(projects.core.common)
    implementation(projects.core.model)
    implementation(libs.kotlinx.coroutines.android)
}

plugins {
    alias(libs.plugins.worktrack.android.library.compose)
}

android {
    namespace = "app.worktrack.core.designsystem"
}

dependencies {
    implementation(projects.core.common)
    implementation(libs.androidx.compose.material.icons)
}

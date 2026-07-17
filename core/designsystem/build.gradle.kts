plugins {
    alias(libs.plugins.worktrack.android.library.compose)
}

android {
    namespace = "app.worktrack.core.designsystem"
}

dependencies {
    implementation(libs.androidx.compose.material.icons)
}

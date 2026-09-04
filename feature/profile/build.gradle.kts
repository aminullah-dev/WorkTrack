plugins {
    alias(libs.plugins.worktrack.android.feature)
}

android {
    namespace = "app.worktrack.feature.profile"
}

dependencies {
    // AppCompatDelegate drives the in-app language switch (Dari/Pashto/English).
    implementation(libs.androidx.appcompat)
}

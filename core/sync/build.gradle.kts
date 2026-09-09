plugins {
    alias(libs.plugins.worktrack.android.library)
    alias(libs.plugins.worktrack.android.hilt)
}

android {
    namespace = "app.worktrack.core.sync"
}

dependencies {
    implementation(projects.core.common)
    implementation(projects.core.data)

    implementation(libs.androidx.work.runtime)
    implementation(libs.hilt.ext.work)
    ksp(libs.hilt.ext.compiler)
    implementation(libs.kotlinx.coroutines.android)
}

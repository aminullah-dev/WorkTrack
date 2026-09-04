plugins {
    alias(libs.plugins.worktrack.android.library)
    alias(libs.plugins.worktrack.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "app.worktrack.core.data"
}

dependencies {
    api(projects.core.domain)
    implementation(projects.core.common)
    implementation(projects.core.model)
    implementation(projects.core.database)
    implementation(projects.core.datastore)
    implementation(projects.core.network)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.kotlinx.serialization.json)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)

    testImplementation(libs.turbine)
}

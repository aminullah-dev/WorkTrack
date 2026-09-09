plugins {
    alias(libs.plugins.worktrack.jvm.library)
}

dependencies {
    api(libs.kotlinx.coroutines.core)
    implementation(libs.javax.inject)
}

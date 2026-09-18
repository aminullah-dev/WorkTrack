plugins {
    alias(libs.plugins.worktrack.jvm.library)
}

dependencies {
    api(projects.core.common)
    api(projects.core.model)
    implementation(libs.javax.inject)

    testImplementation(libs.turbine)
}

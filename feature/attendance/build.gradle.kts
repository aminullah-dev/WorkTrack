plugins {
    alias(libs.plugins.worktrack.android.feature)
}

android {
    namespace = "app.worktrack.feature.attendance"
}

dependencies {
    implementation(libs.play.services.location)
    implementation(libs.kotlinx.coroutines.play.services)

    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.view)
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.mlkit.face.detection)
    implementation(libs.tflite)
    implementation(libs.tflite.support)
}

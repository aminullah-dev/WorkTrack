import app.worktrack.buildlogic.configureAndroidCompose
import app.worktrack.buildlogic.configureKotlinAndroid
import com.android.build.api.dsl.ApplicationExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

class AndroidApplicationConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("com.android.application")
            pluginManager.apply("org.jetbrains.kotlin.android")

            extensions.configure<ApplicationExtension> {
                configureKotlinAndroid(this)
                configureAndroidCompose(this)

                defaultConfig {
                    // Google Play's floor for new apps and updates since
                    // 31 August 2026. Targeting 36 opts the app into Android
                    // 16's behaviour changes; the one that would have bitten
                    // us is enforced edge-to-edge, and MainActivity already
                    // calls enableEdgeToEdge() with a Scaffold that consumes
                    // the insets, so there is nothing to adapt.
                    targetSdk = 36
                }

                buildTypes {
                    release {
                        isMinifyEnabled = true
                        isShrinkResources = true
                        proguardFiles(
                            getDefaultProguardFile("proguard-android-optimize.txt"),
                            "proguard-rules.pro",
                        )
                    }
                }

                packaging {
                    resources {
                        excludes += "/META-INF/{AL2.0,LGPL2.1}"
                    }
                }
            }
        }
    }
}

import app.worktrack.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies

/**
 * Standard setup for feature modules: Compose library + Hilt + the dependency set
 * every screen needs (domain contracts, design system, lifecycle, navigation).
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("worktrack.android.library.compose")
            pluginManager.apply("worktrack.android.hilt")

            dependencies {
                "implementation"(project(":core:common"))
                "implementation"(project(":core:model"))
                "implementation"(project(":core:domain"))
                "implementation"(project(":core:designsystem"))

                "implementation"(libs.findLibrary("androidx-lifecycle-runtime-compose").get())
                "implementation"(libs.findLibrary("androidx-lifecycle-viewmodel-compose").get())
                "implementation"(libs.findLibrary("androidx-navigation-compose").get())
                "implementation"(libs.findLibrary("hilt-navigation-compose").get())
                "implementation"(libs.findLibrary("kotlinx-coroutines-android").get())
                "implementation"(libs.findLibrary("androidx-compose-material-icons").get())

                "testImplementation"(libs.findLibrary("turbine").get())
                "testImplementation"(libs.findLibrary("mockk").get())
            }
        }
    }
}

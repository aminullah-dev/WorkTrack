import app.worktrack.buildlogic.libs
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.jvm.toolchain.JavaLanguageVersion
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies

/**
 * Pure-JVM Kotlin module: fastest to compile and enforces that domain logic
 * stays free of Android framework types.
 */
class JvmLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            pluginManager.apply("org.jetbrains.kotlin.jvm")

            extensions.configure<JavaPluginExtension> {
                toolchain {
                    languageVersion.set(JavaLanguageVersion.of(17))
                }
            }

            dependencies {
                "testImplementation"(libs.findLibrary("junit4").get())
                "testImplementation"(libs.findLibrary("kotlinx-coroutines-test").get())
            }
        }
    }
}

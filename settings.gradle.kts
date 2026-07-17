pluginManagement {
    includeBuild("build-logic")
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "WorkTrack"

enableFeaturePreview("TYPESAFE_PROJECT_ACCESSORS")

include(":app")

include(":core:common")
include(":core:model")
include(":core:domain")
include(":core:database")
include(":core:datastore")
include(":core:network")
include(":core:data")
include(":core:sync")
include(":core:designsystem")

include(":feature:auth")
include(":feature:dashboard")
include(":feature:attendance")
include(":feature:leave")
include(":feature:payslips")
include(":feature:profile")

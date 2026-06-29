plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "fr.maitresinh.ludovive"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.maitresinh.ludovive"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}


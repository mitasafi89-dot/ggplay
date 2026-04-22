plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "uk.template.shift"
    compileSdk = 35

    defaultConfig {
        applicationId = "uk.template.shift"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        vectorDrawables {
            useSupportLibrary = true
        }
    }

    flavorDimensions += "brand"

// >>> GENERATED FLAVORS START — managed by apps/generator/generate.py
    signingConfigs {
        create("c13510663") {
            storeFile = file("keystores/13510663.jks")
            storePassword = "b12266fe069e77f88a50551cca9acc8e"
            keyAlias = "upload"
            keyPassword = "b12266fe069e77f88a50551cca9acc8e"
        }
        create("c02591663") {
            storeFile = file("keystores/02591663.jks")
            storePassword = "81b69ec2d57ac457c45efe79cf380dc1"
            keyAlias = "upload"
            keyPassword = "81b69ec2d57ac457c45efe79cf380dc1"
        }
        create("c08699016") {
            storeFile = file("keystores/08699016.jks")
            storePassword = "bcfb472cc508972bd7d376d4a8c7fcad"
            keyAlias = "upload"
            keyPassword = "bcfb472cc508972bd7d376d4a8c7fcad"
        }
    }

    productFlavors {
        create("c13510663") {
            dimension = "brand"
            applicationId = "uk.c13510663.shift"
            buildConfigField("String", "COMPANY_NAME", "\"Swift Plus Personnel\"")
            buildConfigField("String", "COMPANY_NUMBER", "\"13510663\"")
            buildConfigField("String", "SUPPORT_EMAIL", "\"drscholarysophia408@gmail.com\"")
            buildConfigField("String", "ROLE_NOUN", "\"shift\"")
            buildConfigField("String", "ROLE_VERB_START", "\"Start Shift\"")
            buildConfigField("String", "ROLE_VERB_END", "\"End Shift\"")
            buildConfigField("String", "EXPORT_TITLE", "\"Shift Log\"")
            signingConfig = signingConfigs.getByName("c13510663")
        }
        create("c02591663") {
            dimension = "brand"
            applicationId = "uk.c02591663.shift"
            buildConfigField("String", "COMPANY_NAME", "\"51 St Margarets Road Managemen\"")
            buildConfigField("String", "COMPANY_NUMBER", "\"02591663\"")
            buildConfigField("String", "SUPPORT_EMAIL", "\"abdulelahhabib060@gmail.com\"")
            buildConfigField("String", "ROLE_NOUN", "\"visit\"")
            buildConfigField("String", "ROLE_VERB_START", "\"Start Visit\"")
            buildConfigField("String", "ROLE_VERB_END", "\"End Visit\"")
            buildConfigField("String", "EXPORT_TITLE", "\"Site Visit Log\"")
            signingConfig = signingConfigs.getByName("c02591663")
        }
        create("c08699016") {
            dimension = "brand"
            applicationId = "uk.c08699016.shift"
            buildConfigField("String", "COMPANY_NAME", "\"T- Quo\"")
            buildConfigField("String", "COMPANY_NUMBER", "\"08699016\"")
            buildConfigField("String", "SUPPORT_EMAIL", "\"aaaliyanzmoreau255@gmail.com\"")
            buildConfigField("String", "ROLE_NOUN", "\"trip\"")
            buildConfigField("String", "ROLE_VERB_START", "\"Start Trip\"")
            buildConfigField("String", "ROLE_VERB_END", "\"End Trip\"")
            buildConfigField("String", "EXPORT_TITLE", "\"Delivery Log\"")
            signingConfig = signingConfigs.getByName("c08699016")
        }
    }
    // <<< GENERATED FLAVORS END

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.datastore)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

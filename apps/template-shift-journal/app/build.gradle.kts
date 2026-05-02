plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "uk.company.utility"
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
    }

    productFlavors {
        create("c13510663") {
            dimension = "brand"
            applicationId = "uk.swiftpluspersonnel.app"
            buildConfigField("String", "COMPANY_NAME", "\"Swift Plus Personnel\"")
            buildConfigField("String", "COMPANY_NUMBER", "\"13510663\"")
            buildConfigField("String", "SUPPORT_EMAIL", "\"dev@swift-plus-personnel.online\"")
            buildConfigField("String", "COMPANY_DOMAIN", "\"swift-plus-personnel.online\"")
            buildConfigField("String", "PRIVACY_POLICY_URL", "\"\"")
            buildConfigField("String", "CONTACT_ADDRESS", "\"13510663 - COMPANIES HOUSE DEFAULT ADDRESS, Cardiff, CF14 8LH\"")
            buildConfigField("String", "ROLE_NOUN", "\"shift\"")
            buildConfigField("String", "ROLE_VERB_START", "\"Start Shift\"")
            buildConfigField("String", "ROLE_VERB_END", "\"End Shift\"")
            buildConfigField("String", "EXPORT_TITLE", "\"Shift Log\"")
            buildConfigField("String", "CALC_TITLE", "\"Day Rate Calculator\"")
            buildConfigField("String", "CALC_LABEL_A", "\"Daily Rate (£)\"")
            buildConfigField("String", "CALC_LABEL_B", "\"Number of Days\"")
            buildConfigField("String", "CALC_FORMULA", "\"MULTIPLY\"")
            buildConfigField("String", "CALC_RESULT_LABEL", "\"Total Earnings\"")
            buildConfigField("String", "INFO_TITLE", "\"Employment Reference\"")
            buildConfigField("String", "INFO_ITEMS_JSON", "\"[{\\\"k\\\":\\\"National Living Wage\\\",\\\"v\\\":\\\"\\\\u00a311.44 / hr (Apr 2024)\\\"},{\\\"k\\\":\\\"Employer NI Threshold\\\",\\\"v\\\":\\\"\\\\u00a39,100 / yr\\\"},{\\\"k\\\":\\\"Employer NI Rate\\\",\\\"v\\\":\\\"13.8% above threshold\\\"},{\\\"k\\\":\\\"Statutory Holiday\\\",\\\"v\\\":\\\"28 days incl. 8 bank holidays\\\"},{\\\"k\\\":\\\"Holiday Pay Rate\\\",\\\"v\\\":\\\"12.07% of pay (part-time)\\\"},{\\\"k\\\":\\\"Auto-Enrolment Min.\\\",\\\"v\\\":\\\"3% employer contribution\\\"},{\\\"k\\\":\\\"IR35 Off-Payroll\\\",\\\"v\\\":\\\"Applies April 2021 (medium/large)\\\"},{\\\"k\\\":\\\"Statutory Sick Pay\\\",\\\"v\\\":\\\"\\\\u00a3116.75 / week (2024)\\\"}]\"")
            buildConfigField("String", "ACTION_LABEL", "\"Book a Worker\"")
            signingConfig = signingConfigs.getByName("c13510663")
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

// The private key is supplied by GitHub Actions Secrets, never committed to source control.
android {
    defaultConfig {
        versionCode = (System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1) + 1000
        versionName = "1.12." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }
    if (!System.getenv("FOLD_SIGNING_PATH").isNullOrBlank() &&
        !System.getenv("FOLD_SIGNING_PASSWORD").isNullOrBlank()) {
        signingConfigs {
            create("foldReader") {
                storeFile = file(System.getenv("FOLD_SIGNING_PATH"))
                storePassword = System.getenv("FOLD_SIGNING_PASSWORD")
                keyAlias = "foldreader"
                keyPassword = System.getenv("FOLD_SIGNING_PASSWORD")
                storeType = "pkcs12"
            }
        }
        buildTypes.getByName("debug") {
            signingConfig = signingConfigs.getByName("foldReader")
        }
    }
}

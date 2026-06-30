plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

base {
    archivesName.set("songbook")
}

android {
    namespace = "com.mymusic.songbook"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.mymusic.songbook"
        minSdk = 23
        targetSdk = 36
        versionCode = 14
        versionName = "1.5.5"
    }

    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = "songbook2026"
            keyAlias = "songbook"
            keyPassword = "songbook2026"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
      compose = true
      aidl = false
      buildConfig = false
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)


  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // WebKit for secure WebView loading (WebViewAssetLoader)
  implementation("androidx.webkit:webkit:1.12.0")

  // Google Sign-In Native Auth
  implementation("com.google.android.gms:play-services-auth:21.1.1")
}

// Ensure web assets are bundled and synced before compiling the APK
tasks.named("preBuild") {
    dependsOn(tasks.named("bundleHtml"))
}

abstract class BundleHtmlTask : DefaultTask() {
    @get:Internal
    abstract val projectDir: DirectoryProperty

    @TaskAction
    fun run() {
        val rootDir = projectDir.get().asFile
        try {
            // Now run sync_android.py to ensure the updated web/ directory is synced into Android assets
            val syncProcess = ProcessBuilder("python", "scripts/sync_android.py")
                .directory(rootDir)
                .redirectErrorStream(true)
                .start()
                
            syncProcess.inputStream.bufferedReader().use { reader ->
                var line: String? = reader.readLine()
                while (line != null) {
                    println(line)
                    line = reader.readLine()
                }
            }
            
            val syncExitCode = syncProcess.waitFor()
            if (syncExitCode != 0) {
                logger.warn("Warning: sync_android.py exited with code $syncExitCode")
            }
        } catch (e: Exception) {
            logger.warn("Warning: Failed to execute sync_android.py. Error: ${e.message}")
        }
    }
}

abstract class PublishOutputsTask : DefaultTask() {
    @get:InputDirectory
    abstract val apkOutputDir: DirectoryProperty

    @get:OutputDirectory
    abstract val destinationDir: DirectoryProperty

    @get:Input
    abstract val deployToFirebase: Property<Boolean>

    @TaskAction
    fun run() {
        val apkDir = apkOutputDir.get().asFile
        val destDir = destinationDir.get().asFile
        
        if (!destDir.exists()) {
            destDir.mkdirs()
        }

        // Copy any APK files
        if (apkDir.exists()) {
            val files = apkDir.listFiles { _, name -> name.endsWith(".apk") }
            if (files != null && files.isNotEmpty()) {
                for (apkFile in files) {
                    val apkDest = destDir.resolve(apkFile.name)
                    apkFile.copyTo(apkDest, overwrite = true)
                    logger.lifecycle("Copied ${apkFile.name} to ${apkDest.absolutePath}")
                }
            } else {
                logger.warn("Warning: No APK files found in ${apkDir.absolutePath}")
            }
        } else {
            logger.warn("Warning: APK directory does not exist: ${apkDir.absolutePath}")
        }

        // Deploy to Firebase Hosting if configured
        if (deployToFirebase.get()) {
            val rootDir = destinationDir.get().asFile.resolve("..")
            logger.lifecycle("Deploying web assets to Firebase Hosting from directory: ${rootDir.absolutePath}...")
            try {
                val process = ProcessBuilder("cmd", "/c", "npx firebase-tools deploy --only hosting")
                    .directory(rootDir)
                    .redirectErrorStream(true)
                    .start()
                
                process.inputStream.bufferedReader().use { reader ->
                    var line: String? = reader.readLine()
                    while (line != null) {
                        println(line)
                        line = reader.readLine()
                    }
                }
                
                val exitCode = process.waitFor()
                if (exitCode != 0) {
                    logger.warn("Warning: Firebase deploy failed with code $exitCode")
                } else {
                    logger.lifecycle("Firebase deployment completed successfully!")
                }
            } catch (e: Exception) {
                logger.warn("Warning: Failed to execute Firebase deploy. Error: ${e.message}")
            }
        }
    }
}

val bundleHtml = tasks.register<BundleHtmlTask>("bundleHtml") {
    projectDir.set(layout.projectDirectory.dir("../../"))
}

val publishReleaseOutputs = tasks.register<PublishOutputsTask>("publishReleaseOutputs") {
    apkOutputDir.set(layout.buildDirectory.dir("outputs/apk/release"))
    destinationDir.set(layout.projectDirectory.dir("../../outputs"))
    deployToFirebase.set(true)
    dependsOn(bundleHtml)
}

val publishDebugOutputs = tasks.register<PublishOutputsTask>("publishDebugOutputs") {
    apkOutputDir.set(layout.buildDirectory.dir("outputs/apk/debug"))
    destinationDir.set(layout.projectDirectory.dir("../../outputs"))
    deployToFirebase.set(false)
    dependsOn(bundleHtml)
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    finalizedBy(publishReleaseOutputs)
}

tasks.matching { it.name == "assembleDebug" }.configureEach {
    finalizedBy(publishDebugOutputs)
}


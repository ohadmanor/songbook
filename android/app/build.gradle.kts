// Imported rather than written as java.util.Properties: inside a Kotlin DSL
// script `java` resolves to the Java plugin extension, not the package root.
import java.util.Properties

// The Compose compiler and kotlinx-serialization plugins are gone along with the
// Compose UI layer: MainActivity calls setContentView(webView) and never
// setContent {}, so none of that code was ever reachable from the running app.
//
// No Kotlin plugin is listed here on purpose -- AGP 9 has built-in Kotlin support
// and hard-errors if org.jetbrains.kotlin.android is applied alongside it. One
// consequence worth knowing: the Kotlin version was previously pinned to 2.3.20
// only as a side effect of those two Kotlin compiler plugins, and now comes from
// whatever AGP bundles (2.2.10 for AGP 9.0.1). Pinning it independently needs
// kotlin.compilerVersion, which is still an experimental opt-in API, so the
// bundled version stands. Nothing in this module uses version-specific Kotlin.
plugins {
  alias(libs.plugins.android.application)
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
        versionCode = 16
        versionName = "1.6.0"
    }

    // Signing credentials come from android/local.properties (git-ignored) or the
    // environment, never from this file: it is committed, so a password written
    // here is a published password. Existing setups keep working -- the previous
    // literals remain as the final fallback -- but rotating the keystore password
    // and putting the new one in local.properties now keeps it out of history.
    //
    // android/local.properties:
    //   songbook.storePassword=...
    //   songbook.keyAlias=songbook
    //   songbook.keyPassword=...
    val localProps = Properties().apply {
        val f = rootProject.file("local.properties")
        if (f.exists()) f.inputStream().use { stream -> load(stream) }
    }
    fun signingSecret(key: String, fallback: String): String =
        localProps.getProperty("songbook.$key")
            ?: System.getenv("SONGBOOK_${key.uppercase()}")
            ?: fallback

    signingConfigs {
        create("release") {
            storeFile = file("release.keystore")
            storePassword = signingSecret("storePassword", "songbook2026")
            keyAlias = signingSecret("keyAlias", "songbook")
            keyPassword = signingSecret("keyPassword", "songbook2026")
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

// The app is a WebView shell. These four are what MainActivity actually touches;
// the Compose BOM, Material3, navigation3 and the lifecycle/viewmodel Compose
// artifacts were all shipping in the APK without a single reachable call site.
dependencies {
  // ComponentActivity, registerForActivityResult, OnBackPressedCallback
  implementation(libs.androidx.activity.ktx)

  // FileProvider, used by WebAppInterface.shareTextFile
  implementation(libs.androidx.core.ktx)

  // WebViewAssetLoader / WebViewClientCompat for secure local asset loading
  implementation(libs.androidx.webkit)

  // Google Sign-In Native Auth
  implementation(libs.play.services.auth)
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
            val syncProcess = ProcessBuilder("python", "scripts_and_tools/sync_android.py")
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


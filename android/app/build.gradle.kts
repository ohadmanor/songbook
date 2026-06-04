plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

base {
    archivesName.set("songbook")
}

android {
    namespace = "com.example.songbook"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.songbook"
        minSdk = 24
        targetSdk = 36
        versionCode = 10
        versionName = "1.1.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)
}

abstract class BundleHtmlTask : DefaultTask() {
    @get:Internal
    abstract val projectDir: DirectoryProperty

    @TaskAction
    fun run() {
        val rootDir = projectDir.get().asFile
        try {
            val process = ProcessBuilder("python", "scripts/bundle_app.py")
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
                logger.warn("Warning: bundle_app.py exited with code $exitCode")
            }
        } catch (e: Exception) {
            logger.warn("Warning: Failed to execute bundle_app.py. Standalone HTML might be outdated. Error: ${e.message}")
        }
    }
}

abstract class PublishOutputsTask : DefaultTask() {
    @get:InputDirectory
    abstract val apkOutputDir: DirectoryProperty

    @get:OutputDirectory
    abstract val destinationDir: DirectoryProperty

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
    }
}

val bundleHtml = tasks.register<BundleHtmlTask>("bundleHtml") {
    projectDir.set(layout.projectDirectory.dir("../../"))
}

val publishReleaseOutputs = tasks.register<PublishOutputsTask>("publishReleaseOutputs") {
    apkOutputDir.set(layout.buildDirectory.dir("outputs/apk/release"))
    destinationDir.set(layout.projectDirectory.dir("../../outputs"))
    dependsOn(bundleHtml)
}

tasks.matching { it.name == "assembleRelease" }.configureEach {
    finalizedBy(publishReleaseOutputs)
}


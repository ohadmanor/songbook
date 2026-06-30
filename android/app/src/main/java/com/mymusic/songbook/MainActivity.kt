package com.mymusic.songbook

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import java.io.File
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    lateinit var googleSignInClient: GoogleSignInClient

    val signInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (idToken != null) {
                // Pass token to WebView
                webView.post {
                    webView.evaluateJavascript("javascript:handleNativeGoogleLogin('$idToken');", null)
                }
            } else {
                webView.post {
                    webView.evaluateJavascript("javascript:AndroidApp.showToast('Google Sign-In failed: No ID token');", null)
                }
            }
        } catch (e: ApiException) {
            webView.post {
                webView.evaluateJavascript("javascript:AndroidApp.showToast('Google Sign-In failed: ${e.statusCode}');", null)
            }
        }
    }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data: Intent? = result.data
        val results = if (result.resultCode == Activity.RESULT_OK) {
            val dataString = data?.dataString
            val clipData = data?.clipData
            if (clipData != null) {
                val count = clipData.itemCount
                Array(count) { i -> clipData.getItemAt(i).uri }
            } else if (dataString != null) {
                arrayOf(Uri.parse(dataString))
            } else {
                null
            }
        } else {
            null
        }
        filePathCallback?.onReceiveValue(results)
        filePathCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep the screen on during performances
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Configure Google Sign In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("821402914518-etia0o1b06pthsbk7ubnaadrh7u1bpc0.apps.googleusercontent.com")
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            // Remove "; wv" to spoof a standard browser and bypass Google OAuth "disallowed_useragent"
            settings.userAgentString = settings.userAgentString.replace("; wv", "")
            
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }
            }
            
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    
                    val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                    
                    try {
                        fileChooserLauncher.launch(intent)
                    } catch (e: Exception) {
                        this@MainActivity.filePathCallback = null
                        return false
                    }
                    return true
                }
            }
            
            addJavascriptInterface(WebAppInterface(this@MainActivity), "AndroidApp")
        }

        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    class WebAppInterface(private val activity: MainActivity) {
        @JavascriptInterface
        fun startGoogleSignIn() {
            activity.runOnUiThread {
                val signInIntent = activity.googleSignInClient.signInIntent
                activity.signInLauncher.launch(signInIntent)
            }
        }
        
        @JavascriptInterface
        fun signOut() {
            activity.runOnUiThread {
                activity.googleSignInClient.signOut()
            }
        }

        @JavascriptInterface
        fun showToast(toast: String) {
            activity.runOnUiThread {
                android.widget.Toast.makeText(activity, toast, android.widget.Toast.LENGTH_SHORT).show()
            }
        }

        @JavascriptInterface
        fun shareTextFile(filename: String, content: String) {
            try {
                val cacheDir = activity.cacheDir
                val tempFile = File(cacheDir, filename)
                tempFile.writeText(content)
                
                val authority = "${activity.packageName}.fileprovider"
                val uri = FileProvider.getUriForFile(activity, authority, tempFile)
                
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                
                val chooser = Intent.createChooser(shareIntent, "Export Setlist")
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.runOnUiThread {
                    activity.startActivity(chooser)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}

package com.example

import android.annotation.SuppressLint
import android.content.res.Configuration
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import androidx.activity.result.contract.ActivityResultContracts
import android.app.Activity
import android.widget.FrameLayout
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

class MainActivity : ComponentActivity() {
    private lateinit var reader: WebView
    private var coverImageCallback: ValueCallback<Array<Uri>>? = null
    private val coverImageChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = coverImageCallback
        coverImageCallback = null
        val uri = if (result.resultCode == Activity.RESULT_OK)
            result.data?.data ?: result.data?.clipData?.getItemAt(0)?.uri
        else null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }
    private lateinit var windowRoot: FrameLayout
    private var readingMode = false
    private var latestInsets: WindowInsetsCompat? = null

    // Edge-to-edge is mandatory on recent Android versions. Keep the *library*
    // below the real status bar and above navigation gestures, while allowing
    // immersive reading to use the screen once those bars are hidden.
    private fun applyScreenInsets(insets: WindowInsetsCompat) {
        if (!::reader.isInitialized) return
        val system = insets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.systemBars())
        val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
        val left = if (readingMode) cutout.left else maxOf(system.left, cutout.left)
        val top = if (readingMode) cutout.top else maxOf(system.top, cutout.top)
        val right = if (readingMode) cutout.right else maxOf(system.right, cutout.right)
        val bottom = if (readingMode) cutout.bottom else maxOf(system.bottom, cutout.bottom)
        val lp = reader.layoutParams as? FrameLayout.LayoutParams ?: return
        if (lp.leftMargin != left || lp.topMargin != top ||
            lp.rightMargin != right || lp.bottomMargin != bottom) {
            lp.setMargins(left, top, right, bottom)
            reader.layoutParams = lp
        }
    }
    private val executor = Executors.newSingleThreadExecutor()
    private val mainThread = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(75, TimeUnit.SECONDS).followRedirects(true).build()
    private val validId = Regex("^[a-zA-Z0-9_-]{20,100}$")
    private val docLink = Regex("https://docs\\.google\\.com/document/(?:u/\\d+/)?d/[a-zA-Z0-9_-]+")
    private var pendingLink: String? = null
    private var ready = false
    private val domain = "appassets.androidplatform.net"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        pendingLink = sharedLink(intent)
        val loader = WebViewAssetLoader.Builder().setDomain(domain)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/docs/", object : WebViewAssetLoader.PathHandler {
                override fun handle(path: String): WebResourceResponse? {
                    val id = path.removeSuffix(".html")
                    if (path != "$id.html" || !validId.matches(id)) return null
                    val file = docFile(id)
                    if (!file.isFile) return null
                    return WebResourceResponse("text/html", "UTF-8", file.inputStream())
                }
            }).build()
        reader = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            overScrollMode = WebView.OVER_SCROLL_NEVER
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
            addJavascriptInterface(Bridge(), "FoldBridge")
            // HTML <input type=file accept=image/*> requires a native chooser in Android WebView.
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    coverImageCallback?.onReceiveValue(null)
                    coverImageCallback = filePathCallback
                    val chooser = Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    return try {
                        coverImageChooser.launch(Intent.createChooser(chooser, "Choose a book cover"))
                        true
                    } catch (e: Exception) {
                        coverImageCallback?.onReceiveValue(null)
                        coverImageCallback = null
                        false
                    }
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.url.host == domain) return false
                    if (request.url.host == "docs.google.com" && request.url.scheme == "https")
                        openInDocs(request.url.toString())
                    return true
                }
                override fun onPageFinished(view: WebView, url: String?) {
                    ready = true
                    deliverLink()
                }
            }
            loadUrl("https://$domain/assets/fold_reader.html")
        }
        // A native inset-aware parent prevents the web toolbar from being
        // placed underneath the Fold's status bar / camera cutout.
        windowRoot = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(reader, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            ))
        }
        ViewCompat.setOnApplyWindowInsetsListener(windowRoot) { _, insets ->
            latestInsets = insets
            applyScreenInsets(insets)
            insets
        }
        setContentView(windowRoot)
        ViewCompat.requestApplyInsets(windowRoot)
        showBars()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { reader.evaluateJavascript("window.foldBackPressed();", null) }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pendingLink = sharedLink(intent)
        deliverLink()
    }
    private fun sharedLink(intent: Intent?): String? {
        val s = when(intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_VIEW -> intent.data?.toString()
            else -> null
        } ?: return null
        return docLink.find(s)?.value?.let { "$it/edit" }
    }
    private fun deliverLink() {
        if (ready) pendingLink?.let {
            reader.evaluateJavascript("window.foldAddUrl(${JSONObject.quote(it)});", null)
            pendingLink = null
        }
    }
    private fun docFile(id: String) = File(filesDir, "web_doc_${id}.html")
    private fun showBars() {
        WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }
    private fun setFullscreen(reading: Boolean) {
        readingMode = reading
        latestInsets?.let { applyScreenInsets(it) }
        if (::windowRoot.isInitialized) ViewCompat.requestApplyInsets(windowRoot)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        if (reading) controller.hide(WindowInsetsCompat.Type.systemBars()) else controller.show(WindowInsetsCompat.Type.systemBars())
    }
    private fun openInDocs(url: String) {
        if (!docLink.containsMatchIn(url)) return
        mainThread.post {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        }
    }
    private fun downloadHtml(id: String): String {
        val req = Request.Builder()
            .url("https://docs.google.com/document/d/$id/export?format=html")
            .header("User-Agent", "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")
            .build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) error("Google Docs returned HTTP ${r.code}")
            val bytes = r.body?.bytes() ?: error("Empty export")
            val html = if (bytes.size > 2 && bytes[0] == 0x50.toByte() && bytes[1] == 0x4b.toByte()) {
                val parts = mutableListOf<String>()
                ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                    var e = zip.nextEntry
                    while(e != null) {
                        if (!e.isDirectory && e.name.endsWith(".html", ignoreCase=true))
                            parts.add(zip.readBytes().toString(StandardCharsets.UTF_8))
                        zip.closeEntry()
                        e = zip.nextEntry
                    }
                }
                if(parts.isEmpty()) error("No readable HTML in document export")
                "<html><body>" + parts.joinToString("<hr>") {
                    Regex("(?is)<body[^>]*>(.*?)</body>").find(it)?.groupValues?.get(1) ?: it
                } + "</body></html>"
            } else bytes.toString(StandardCharsets.UTF_8)
            if (!Regex("(?i)<(?:html|body|p|h[1-6]|div)\\b").containsMatchIn(html)
                || html.take(1500).contains("accounts.google.com", ignoreCase=true))
                error("Document export requires access; check anyone-with-link sharing")
            return html
        }
    }
    inner class Bridge {
        @JavascriptInterface fun importDocument(id: String) {
            if (!validId.matches(id)) { notifyImport(id,false,"Invalid document ID"); return }
            executor.execute {
                try {
                    val html = downloadHtml(id)
                    val f = docFile(id)
                    val tmp = File(filesDir,"web_doc_${id}.tmp")
                    tmp.writeText(html)
                    if(!tmp.renameTo(f)) { f.writeText(html); tmp.delete() }
                    notifyImport(id,true,"")
                } catch (e: Exception) {
                    if(docFile(id).exists()) notifyImport(id,true,"Using cached copy")
                    else notifyImport(id,false,e.message ?: "Could not read document")
                }
            }
        }
        private fun notifyImport(id:String,success:Boolean,message:String) {
            mainThread.post {
                if (::reader.isInitialized)
                    reader.evaluateJavascript("window.foldNativeLoaded(${JSONObject.quote(id)},$success,${JSONObject.quote(message)});",null)
            }
        }
        @JavascriptInterface fun getLegacyDocs():String =
            getSharedPreferences("docubook_prefs",MODE_PRIVATE).getString("saved_recent_docs","[]") ?: "[]"
        @JavascriptInterface fun setReaderMode(yes:Boolean) { mainThread.post { setFullscreen(yes) } }
        @JavascriptInterface fun openEditor(url:String) { openInDocs(url) }
        @JavascriptInterface fun finishReader() { mainThread.post { finish() } }
    }
    // Keep the same WebView and active book during fold/unfold configuration changes.
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::windowRoot.isInitialized) ViewCompat.requestApplyInsets(windowRoot)
        if (::reader.isInitialized) {
            reader.postDelayed({
                reader.evaluateJavascript("window.foldViewportChanged && window.foldViewportChanged();", null)
            }, 250)
        }
    }
    override fun onDestroy() {
        coverImageCallback?.onReceiveValue(null)
        coverImageCallback = null
        if (::reader.isInitialized) { reader.removeJavascriptInterface("FoldBridge"); reader.destroy() }
        executor.shutdownNow()
        super.onDestroy()
    }
}

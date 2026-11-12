package com.example

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.WebResourceResponse
import org.json.JSONObject
import org.xml.sax.InputSource
import java.io.ByteArrayInputStream
import java.io.File
import java.io.StringReader
import java.net.URLDecoder
import java.nio.file.Paths
import java.util.UUID
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

/** Imports user-selected files into private app storage. */
class LocalImporter(private val context: Context) {
    private val appDomain = "appassets.androidplatform.net"
    private fun htmlFile(id: String) = File(context.filesDir, "web_doc_" + id + ".html")
    fun importFile(uri: Uri): JSONObject {
        val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        } ?: "Imported book"
        val mime = context.contentResolver.getType(uri).orEmpty()
        val type = when {
            name.endsWith(".pdf", true) || mime == "application/pdf" -> "pdf"
            name.endsWith(".epub", true) || mime == "application/epub+zip" -> "epub"
            else -> error("Select a PDF or EPUB file")
        }
        val id = UUID.randomUUID().toString().replace("-", "")
        val source = File(context.filesDir, "local_" + id + "." + type)
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                source.outputStream().use { output ->
                    var total = 0L
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        total += n
                        if (total > 200L * 1024 * 1024) error("File exceeds 200 MB limit")
                        output.write(buffer, 0, n)
                    }
                }
            } ?: error("Unable to open the selected file")
            val html = if (type == "pdf") pdfHtml(id, source) else epubHtml(id, source)
            htmlFile(id).writeText(html, Charsets.UTF_8)
            val cover = if (type == "pdf") "https://$appDomain/pdf/$id/0.png"
                else findEpubCover(id, source)
            return JSONObject().put("id", id).put("type", type)
                .put("title", name.substringBeforeLast('.').take(110))
                .put("url", "/docs/" + id + ".html")
                .put("cover", cover ?: "")
        } catch (e: Exception) {
            source.delete()
            throw e
        }
    }
    private fun pdfHtml(id: String, source: File): String {
        val pageCount = ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { it.pageCount }
        }
        if (pageCount !in 1..5000) error("PDF contains no readable pages or has too many pages")
        return buildString {
            append("<!doctype html><html><body>")
            for (n in 0 until pageCount) {
                if (n > 0) append("<fold-pagebreak></fold-pagebreak>")
                append("<div class='pdfPage'><img class='pdfImage' alt='PDF page ")
                append(n+1)
                append("' src='https://$appDomain/pdf/$id/$n.png'></div>")
            }
            append("</body></html>")
        }
    }
    fun pdfPage(path: String): WebResourceResponse? {
        val match = Regex("^([a-f0-9]{32})/(\\d{1,5})\\.png$").matchEntire(path) ?: return null
        val id = match.groupValues[1]
        val n = match.groupValues[2].toIntOrNull() ?: return null
        val source = File(context.filesDir, "local_" + id + ".pdf")
        if (!source.isFile) return null
        val cache = File(context.cacheDir, "pdf_" + id + "_" + n + ".png")
        if (!cache.isFile || cache.length() == 0L) {
            ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                PdfRenderer(descriptor).use { renderer ->
                    if (n !in 0 until renderer.pageCount) return null
                    renderer.openPage(n).use { page ->
                        val scale = minOf(2.5f, 1450f/page.width.coerceAtLeast(1))
                        val w = (page.width * scale).toInt().coerceIn(1, 2100)
                        val h = (page.height * scale).toInt().coerceIn(1, 3000)
                        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                        try {
                            bitmap.eraseColor(Color.WHITE)
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                            cache.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
                        } finally { bitmap.recycle() }
                    }
                }
            }
        }
        return WebResourceResponse("image/png", null, cache.inputStream())
    }
    private fun parseXml(xml: String): org.w3c.dom.Document {
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = true
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false)
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false)
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
        return factory.newDocumentBuilder().parse(InputSource(StringReader(xml)))
    }
    private fun safeMember(base: String, href: String): String {
        val relative = URLDecoder.decode(href.substringBefore('#').substringBefore('?'), "UTF-8")
        val normal = Paths.get("/", base, relative).normalize().toString().removePrefix("/")
        if (normal.startsWith("../") || normal.isBlank() || normal.contains('\\')) error("Invalid EPUB path")
        return normal
    }
    private fun epubHtml(id: String, source: File): String = ZipFile(source).use { zip ->
        val container = zip.getEntry("META-INF/container.xml") ?: error("Invalid EPUB: missing container")
        val manifestDoc = parseXml(zip.getInputStream(container).bufferedReader().readText())
        val roots = manifestDoc.getElementsByTagNameNS("*", "rootfile")
        if (roots.length < 1) error("Invalid EPUB: missing package")
        val opfPath = (roots.item(0) as org.w3c.dom.Element).getAttribute("full-path")
        val opfEntry = zip.getEntry(opfPath) ?: error("Invalid EPUB: manifest not found")
        val opf = parseXml(zip.getInputStream(opfEntry).bufferedReader().readText())
        val dir = opfPath.substringBeforeLast('/', "")
        val items = opf.getElementsByTagNameNS("*", "item")
        val manifest = mutableMapOf<String, Pair<String, String>>()
        val css = StringBuilder()
        for (i in 0 until items.length) {
            val e = items.item(i) as org.w3c.dom.Element
            val href = e.getAttribute("href")
            if (href.isBlank()) continue
            val path = safeMember(dir, href)
            val type = e.getAttribute("media-type")
            manifest[e.getAttribute("id")] = path to type
            if (type == "text/css") {
                zip.getEntry(path)?.let { cssEntry ->
                    if (cssEntry.size in 0..500_000) css.append(zip.getInputStream(cssEntry).bufferedReader().readText()).append('\n')
                }
            }
        }
        val spine = opf.getElementsByTagNameNS("*", "itemref")
        val sections = mutableListOf<String>()
        for (i in 0 until spine.length) {
            val item = manifest[(spine.item(i) as org.w3c.dom.Element).getAttribute("idref")] ?: continue
            if (item.second.contains("html")) sections.add(item.first)
        }
        if (sections.isEmpty()) error("No readable chapters found in EPUB (DRM-protected books are unsupported)")
        if (sections.size > 3000) error("EPUB contains too many sections")
        buildString {
            append("<html><head><style>").append(css).append("</style></head><body>")
            for ((index, filePath) in sections.withIndex()) {
                val entry = zip.getEntry(filePath) ?: continue
                if (entry.size > 8_000_000) continue
                val raw = zip.getInputStream(entry).bufferedReader().readText()
                val body = Regex("(?is)<body\\b[^>]*>(.*?)</body>").find(raw)?.groupValues?.get(1) ?: raw
                val base = filePath.substringBeforeLast('/', "")
                val withImages = Regex("(?i)(\\bsrc\\s*=\\s*)([\\\"'])([^\\\"']+)\\2").replace(body) { match ->
                    val src = match.groupValues[3]
                    if (src.startsWith("data:") || src.startsWith("https:") || src.startsWith("http:")) match.value
                    else {
                        val image = safeMember(base, src)
                        match.groupValues[1] + match.groupValues[2] +
                            "https://$appDomain/epub/$id/$image" + match.groupValues[2]
                    }
                }
                if (index > 0) append("<fold-pagebreak></fold-pagebreak>")
                append("<section>").append(withImages).append("</section>")
            }
            append("</body></html>")
        }
    }
    // Respect OPF cover-image metadata and EPUB 2 cover id; otherwise choose
    // a cover-looking artwork filename. All artwork stays in the local ZIP.
    private fun findEpubCover(id: String, source: File): String? = runCatching {
        ZipFile(source).use { zip ->
            val rootEntry = zip.getEntry("META-INF/container.xml") ?: return@use null
            val container = parseXml(zip.getInputStream(rootEntry).bufferedReader().readText())
            val rootFiles = container.getElementsByTagNameNS("*", "rootfile")
            if (rootFiles.length == 0) return@use null
            val opfPath = (rootFiles.item(0) as org.w3c.dom.Element).getAttribute("full-path")
            val opfEntry = zip.getEntry(opfPath) ?: return@use null
            val opf = parseXml(zip.getInputStream(opfEntry).bufferedReader().readText())
            val coverMeta = opf.getElementsByTagNameNS("*", "meta")
            var metaId = ""
            for (i in 0 until coverMeta.length) {
                val m = coverMeta.item(i) as org.w3c.dom.Element
                if (m.getAttribute("name").equals("cover", true)) {
                    metaId = m.getAttribute("content"); break
                }
            }
            val items = opf.getElementsByTagNameNS("*", "item")
            val base = opfPath.substringBeforeLast('/', "")
            val images = mutableListOf<Pair<String, Int>>()
            for (i in 0 until items.length) {
                val el = items.item(i) as org.w3c.dom.Element
                val type = el.getAttribute("media-type").lowercase()
                if (type !in listOf("image/png", "image/jpeg", "image/webp", "image/gif")) continue
                val path = safeMember(base, el.getAttribute("href"))
                val entry = zip.getEntry(path) ?: continue
                if (entry.size <= 0 || entry.size > 12L * 1024 * 1024) continue
                val itemId = el.getAttribute("id")
                val props = el.getAttribute("properties")
                val filename = path.substringAfterLast('/').lowercase()
                val rank = when {
                    props.split(" ").contains("cover-image") -> 0
                    itemId == metaId && metaId.isNotBlank() -> 1
                    filename.contains("cover") || itemId.contains("cover", true) -> 2
                    else -> 9
                }
                images.add(path to rank)
            }
            val selected = images.minByOrNull { it.second }?.takeIf { it.second <= 2 }?.first
            selected?.let { "https://$appDomain/epub/$id/" + Uri.encode(it, "/") }
        }
    }.getOrNull()

    fun epubImage(path: String): WebResourceResponse? {
        if (path.length < 34 || path[32] != '/') return null
        val id = path.substring(0, 32)
        if (!Regex("^[a-f0-9]{32}$").matches(id)) return null
        val raw = Uri.decode(path.substring(33))
        val name = safeMember("", raw)
        if (name != raw) return null
        val mime = when (name.substringAfterLast('.').lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            else -> return null
        }
        val file = File(context.filesDir, "local_" + id + ".epub")
        if (!file.isFile) return null
        ZipFile(file).use { zip ->
            val entry = zip.getEntry(name) ?: return null
            if (entry.size > 12L * 1024 * 1024) return null
            return WebResourceResponse(mime, null, ByteArrayInputStream(zip.getInputStream(entry).readBytes()))
        }
    }
}
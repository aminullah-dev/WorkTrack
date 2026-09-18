package app.worktrack.feature.attendance.face

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel
import kotlin.math.sqrt

/**
 * On-device face embedding with a MobileFaceNet TFLite model.
 *
 * Identity matching is done by comparing embeddings (cosine similarity on the
 * server). Only the resulting numeric vector ever leaves the device — never the
 * photo — so no biometric image is uploaded or stored.
 *
 * SETUP: drop a MobileFaceNet model (112×112 input → 192-d output) at
 * `feature/attendance/src/main/assets/mobilefacenet.tflite`. A widely used
 * open model works; if its output size differs (e.g. 128), update
 * [EMBEDDING_SIZE].
 */
/** The TFLite model asset is missing or unreadable on this device. */
class FaceModelUnavailableException(cause: Throwable) : Exception(cause)

class FaceEmbedder(context: Context) : AutoCloseable {

    private val appContext = context.applicationContext
    private val interpreterDelegate = lazy { Interpreter(loadModel()) }
    private val interpreter: Interpreter by interpreterDelegate

    /**
     * Guards the native interpreter: [close] must not free it while [embed] is
     * still running on a background dispatcher (backing out of the screen
     * mid-capture would otherwise crash in native code).
     */
    private val lock = Any()
    private var closed = false

    /** Embedding size read from the model itself, so 128-d or 192-d both work. */
    val embeddingSize: Int by lazy { interpreter.getOutputTensor(0).shape().last() }

    /** A cropped face bitmap → L2-normalized embedding, ready to send to the API. */
    fun embed(face: Bitmap): FloatArray = synchronized(lock) {
        check(!closed) { "FaceEmbedder was closed" }
        val output = Array(1) { FloatArray(embeddingSize) }
        interpreter.run(preprocess(face), output)
        l2Normalize(output[0])
    }

    private fun preprocess(bitmap: Bitmap): ByteBuffer {
        val resized = Bitmap.createScaledBitmap(bitmap, INPUT_SIZE, INPUT_SIZE, true)
        val buffer = ByteBuffer
            .allocateDirect(INPUT_SIZE * INPUT_SIZE * CHANNELS * Float.SIZE_BYTES)
            .order(ByteOrder.nativeOrder())
        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        resized.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)
        for (pixel in pixels) {
            val r = (pixel shr 16 and 0xFF)
            val g = (pixel shr 8 and 0xFF)
            val b = (pixel and 0xFF)
            // MobileFaceNet normalization: (channel − 127.5) / 128
            buffer.putFloat((r - 127.5f) / 128f)
            buffer.putFloat((g - 127.5f) / 128f)
            buffer.putFloat((b - 127.5f) / 128f)
        }
        buffer.rewind()
        return buffer
    }

    private fun loadModel(): ByteBuffer {
        try {
            appContext.assets.openFd(MODEL_ASSET).use { fd ->
                FileInputStream(fd.fileDescriptor).use { input ->
                    return input.channel.map(
                        FileChannel.MapMode.READ_ONLY,
                        fd.startOffset,
                        fd.declaredLength,
                    )
                }
            }
        } catch (e: IOException) {
            // Surfaced distinctly so the UI can say the model is missing rather
            // than blaming the capture.
            throw FaceModelUnavailableException(e)
        }
    }

    override fun close() = synchronized(lock) {
        if (!closed) {
            closed = true
            // Only touch the interpreter if something actually built it.
            if (interpreterDelegate.isInitialized()) interpreter.close()
        }
    }

    companion object {
        private const val MODEL_ASSET = "mobilefacenet.tflite"
        private const val INPUT_SIZE = 112
        private const val CHANNELS = 3

        /** L2-normalizes so cosine similarity == dot product on the server. */
        fun l2Normalize(v: FloatArray): FloatArray {
            var norm = 0f
            for (x in v) norm += x * x
            norm = sqrt(norm)
            return if (norm == 0f) v else FloatArray(v.size) { v[it] / norm }
        }
    }
}

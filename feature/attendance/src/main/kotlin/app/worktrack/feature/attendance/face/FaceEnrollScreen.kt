package app.worktrack.feature.attendance.face

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.graphics.Rect
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.NoPhotography
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.feature.attendance.R
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/**
 * Face enrollment: guides the employee to position their face, captures one
 * frame, computes an on-device embedding ([FaceEmbedder]) and submits ONLY the
 * numeric vector via [onSubmit] (never a photo). Verified check-ins then match
 * against this embedding on the server.
 */
/** Face enrollment (registers the caller's embedding). */
@Composable
fun FaceEnrollRoute(
    onBack: () -> Unit,
    onSubmit: suspend (List<Float>) -> FaceCaptureResult,
    onDone: (FaceCaptureResult.Success) -> Unit,
) = FaceCaptureRoute(
    titleRes = R.string.att_face_enroll_title,
    actionRes = R.string.att_face_enroll_capture,
    doneRes = R.string.att_face_enroll_done,
    onBack = onBack,
    onSubmit = onSubmit,
    onDone = onDone,
)

/** Face verification for a check-in (matches against the enrolled embedding). */
@Composable
fun FaceVerifyRoute(
    onBack: () -> Unit,
    onSubmit: suspend (List<Float>) -> FaceCaptureResult,
    onDone: (FaceCaptureResult.Success) -> Unit,
) = FaceCaptureRoute(
    titleRes = R.string.att_face_verify_title,
    actionRes = R.string.att_face_verify_capture,
    doneRes = R.string.att_face_verify_done,
    onBack = onBack,
    onSubmit = onSubmit,
    onDone = onDone,
)

@Composable
private fun FaceCaptureRoute(
    titleRes: Int,
    actionRes: Int,
    doneRes: Int,
    onBack: () -> Unit,
    onSubmit: suspend (List<Float>) -> FaceCaptureResult,
    onDone: (FaceCaptureResult.Success) -> Unit,
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> hasCameraPermission = granted }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = { WtTopBar(title = stringResource(titleRes), onBack = onBack) },
    ) { padding ->
        if (hasCameraPermission) {
            FaceCaptureContent(
                actionRes = actionRes,
                doneRes = doneRes,
                onSubmit = onSubmit,
                onDone = onDone,
                modifier = Modifier.fillMaxSize().padding(padding),
            )
        } else {
            EmptyState(
                icon = Icons.Filled.NoPhotography,
                title = stringResource(R.string.att_qr_camera_permission_title),
                message = stringResource(R.string.att_qr_camera_permission_msg),
                modifier = Modifier.padding(padding),
            )
        }
    }
}

private sealed interface CapturePhase {
    data object Scanning : CapturePhase
    data object Submitting : CapturePhase
    data class Done(val result: FaceCaptureResult.Success) : CapturePhase
    data class Failed(@StringRes val messageRes: Int) : CapturePhase
}

/** Maps a submission outcome to the message the person at the camera sees. */
@StringRes
private fun failureMessageOf(result: FaceCaptureResult): Int = when (result) {
    FaceCaptureResult.NoMatch -> R.string.att_face_verify_no_match
    FaceCaptureResult.NotEnrolled -> R.string.att_face_verify_not_enrolled
    FaceCaptureResult.AlreadyEnrolled -> R.string.att_face_enroll_already
    else -> R.string.att_face_enroll_error
}

@Composable
private fun FaceCaptureContent(
    actionRes: Int,
    doneRes: Int,
    onSubmit: suspend (List<Float>) -> FaceCaptureResult,
    onDone: (FaceCaptureResult.Success) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val embedder = remember { FaceEmbedder(context) }
    val detector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .build(),
        )
    }
    val imageCapture = remember { ImageCapture.Builder().build() }
    var faceReady by remember { mutableStateOf(false) }
    var phase by remember { mutableStateOf<CapturePhase>(CapturePhase.Scanning) }

    DisposableEffect(Unit) {
        onDispose {
            detector.close()
            embedder.close()
            analysisExecutor.shutdown()
            ProcessCameraProvider.getInstance(context).get().unbindAll()
        }
    }

    LaunchedEffect(phase) {
        val done = phase as? CapturePhase.Done ?: return@LaunchedEffect
        kotlinx.coroutines.delay(1200)
        onDone(done.result)
    }

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.fillMaxWidth().weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { viewContext ->
                    val previewView = PreviewView(viewContext)
                    val providerFuture = ProcessCameraProvider.getInstance(viewContext)
                    providerFuture.addListener(
                        {
                            val provider = providerFuture.get()
                            val preview = Preview.Builder().build().also {
                                it.setSurfaceProvider(previewView.surfaceProvider)
                            }
                            val analysis = ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()
                            analysis.setAnalyzer(analysisExecutor) { proxy ->
                                detectFace(proxy, detector) { present -> faceReady = present }
                            }
                            provider.unbindAll()
                            provider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_FRONT_CAMERA,
                                preview,
                                analysis,
                                imageCapture,
                            )
                        },
                        ContextCompat.getMainExecutor(viewContext),
                    )
                    previewView
                },
            )
            // Circular face guide: turns to the brand color once a face is found.
            Box(
                Modifier
                    .fillMaxWidth(0.72f)
                    .aspectRatio(1f)
                    .clip(CircleShape)
                    .border(
                        BorderStroke(
                            3.dp,
                            if (faceReady) MaterialTheme.colorScheme.primary else Color.White.copy(alpha = 0.7f),
                        ),
                        CircleShape,
                    ),
            )
            if (phase is CapturePhase.Done) {
                Box(
                    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f)),
                    contentAlignment = Alignment.Center,
                ) {
                    androidx.compose.material3.Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.fillMaxWidth(0.25f).aspectRatio(1f),
                    )
                }
            }
        }

        Column(
            Modifier.fillMaxWidth().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(
                    when (val current = phase) {
                        CapturePhase.Submitting -> R.string.att_face_enroll_saving
                        is CapturePhase.Done -> doneRes
                        is CapturePhase.Failed -> current.messageRes
                        CapturePhase.Scanning ->
                            if (faceReady) R.string.att_face_enroll_ready else R.string.att_face_enroll_hint
                    },
                ),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                color = when (phase) {
                    is CapturePhase.Failed -> MaterialTheme.colorScheme.error
                    is CapturePhase.Done -> MaterialTheme.colorScheme.primary
                    else -> if (faceReady) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            if (phase == CapturePhase.Submitting) {
                CircularProgressIndicator()
            } else if (phase !is CapturePhase.Done) {
                WtPrimaryButton(
                    text = stringResource(actionRes),
                    enabled = faceReady && phase != CapturePhase.Submitting,
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        phase = CapturePhase.Submitting
                        imageCapture.takePicture(
                            ContextCompat.getMainExecutor(context),
                            object : ImageCapture.OnImageCapturedCallback() {
                                override fun onCaptureSuccess(image: ImageProxy) {
                                    val bitmap = image.toUprightBitmap()
                                    image.close()
                                    scope.launch {
                                        phase = try {
                                            val embedding = withContext(Dispatchers.Default) {
                                                // Crop to the detected face first — MobileFaceNet
                                                // needs a tight face crop, not the whole frame,
                                                // or embeddings won't match on verification.
                                                val faceCrop = cropToFace(bitmap)
                                                embedder.embed(faceCrop).toList()
                                            }
                                            when (val result = onSubmit(embedding)) {
                                                is FaceCaptureResult.Success -> CapturePhase.Done(result)
                                                else -> CapturePhase.Failed(failureMessageOf(result))
                                            }
                                        } catch (_: FaceModelUnavailableException) {
                                            CapturePhase.Failed(R.string.att_face_enroll_no_model)
                                        } catch (_: Exception) {
                                            CapturePhase.Failed(R.string.att_face_enroll_error)
                                        }
                                    }
                                }

                                override fun onError(exception: ImageCaptureException) {
                                    phase = CapturePhase.Failed(R.string.att_face_enroll_error)
                                }
                            },
                        )
                    },
                )
            }
        }
    }
}

private fun detectFace(
    proxy: ImageProxy,
    detector: com.google.mlkit.vision.face.FaceDetector,
    onResult: (Boolean) -> Unit,
) {
    val mediaImage = proxy.image
    if (mediaImage == null) {
        proxy.close()
        return
    }
    val input = InputImage.fromMediaImage(mediaImage, proxy.imageInfo.rotationDegrees)
    detector.process(input)
        .addOnSuccessListener { faces -> onResult(faces.size == 1) }
        .addOnCompleteListener { proxy.close() }
}

/** Captured proxy → a rotation-corrected Bitmap for the embedder. */
private fun ImageProxy.toUprightBitmap(): Bitmap {
    val raw = toBitmap()
    val degrees = imageInfo.rotationDegrees
    if (degrees == 0) return raw
    val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
}

/**
 * Detects the largest face in [frame] and returns a tight (margined) crop of it,
 * so the embedder sees just the face. Falls back to a centered square when no
 * face is found. Uses its own detector instance to avoid clashing with the
 * live preview analyzer.
 */
private suspend fun cropToFace(frame: Bitmap): Bitmap {
    val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
            .build(),
    )
    return try {
        val box: Rect? = suspendCancellableCoroutine { cont ->
            detector.process(InputImage.fromBitmap(frame, 0))
                .addOnSuccessListener { faces ->
                    cont.resume(faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }?.boundingBox)
                }
                .addOnFailureListener { cont.resume(null) }
        }
        if (box != null) frame.cropWithMargin(box) else frame.centerSquare()
    } finally {
        detector.close()
    }
}

/** Crops [box] expanded by ~25% on each side, clamped to the bitmap bounds. */
private fun Bitmap.cropWithMargin(box: Rect): Bitmap {
    val marginX = (box.width() * 0.25f).toInt()
    val marginY = (box.height() * 0.25f).toInt()
    val left = (box.left - marginX).coerceIn(0, width - 1)
    val top = (box.top - marginY).coerceIn(0, height - 1)
    val right = (box.right + marginX).coerceIn(left + 1, width)
    val bottom = (box.bottom + marginY).coerceIn(top + 1, height)
    return Bitmap.createBitmap(this, left, top, right - left, bottom - top)
}

private fun Bitmap.centerSquare(): Bitmap {
    val size = minOf(width, height)
    return Bitmap.createBitmap(this, (width - size) / 2, (height - size) / 2, size, size)
}

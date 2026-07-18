package app.worktrack.feature.attendance.selfie

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.NoPhotography
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import app.worktrack.core.designsystem.component.EmptyState
import app.worktrack.core.designsystem.component.WtPrimaryButton
import app.worktrack.core.designsystem.component.WtTopBar
import app.worktrack.feature.attendance.R
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

/**
 * Front-camera selfie capture for photo-verified check-in. A face must be
 * detected on-device (ML Kit) before the shutter enables; the captured frame is
 * downscaled and returned as a small base64 JPEG data URL via [onCaptured].
 * This is capture-for-review, not 1:1 recognition — no biometric data is stored.
 */
@Composable
fun SelfieCaptureRoute(
    onBack: () -> Unit,
    onCaptured: (String) -> Unit,
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
        topBar = { WtTopBar(title = stringResource(R.string.att_selfie_title), onBack = onBack) },
    ) { padding ->
        if (hasCameraPermission) {
            SelfieCamera(
                onCaptured = onCaptured,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
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

@Composable
private fun SelfieCamera(
    onCaptured: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val detector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .build(),
        )
    }
    val imageCapture = remember { ImageCapture.Builder().build() }
    var faceReady by remember { mutableStateOf(false) }
    var capturing by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        onDispose {
            detector.close()
            analysisExecutor.shutdown()
            ProcessCameraProvider.getInstance(context).get().unbindAll()
        }
    }

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
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
        }

        Column(
            Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(
                    if (faceReady) R.string.att_selfie_ready else R.string.att_selfie_hint,
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = if (faceReady) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            WtPrimaryButton(
                text = stringResource(R.string.att_selfie_capture),
                onClick = {
                    capturing = true
                    imageCapture.takePicture(
                        ContextCompat.getMainExecutor(context),
                        object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(image: ImageProxy) {
                                val data = image.toBase64Jpeg()
                                image.close()
                                onCaptured(data)
                            }

                            override fun onError(exception: ImageCaptureException) {
                                capturing = false
                            }
                        },
                    )
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = faceReady && !capturing,
                loading = capturing,
            )
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

/** Captured JPEG proxy -> rotated, downscaled, base64 JPEG data URL (~small). */
private fun ImageProxy.toBase64Jpeg(): String {
    val buffer = planes[0].buffer
    val bytes = ByteArray(buffer.remaining()).also { buffer.get(it) }
    var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

    val rotation = imageInfo.rotationDegrees
    if (rotation != 0) {
        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
    }

    val maxEdge = 320
    val longest = maxOf(bmp.width, bmp.height)
    if (longest > maxEdge) {
        val scale = maxEdge.toFloat() / longest
        bmp = Bitmap.createScaledBitmap(
            bmp,
            (bmp.width * scale).toInt(),
            (bmp.height * scale).toInt(),
            true,
        )
    }

    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, 60, out)
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

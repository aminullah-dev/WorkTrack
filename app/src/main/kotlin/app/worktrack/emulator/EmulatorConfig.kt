package app.worktrack.emulator

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth

/**
 * Wires the app to the local Firebase Emulator Suite for the offline demo, so
 * the seeded users (see backend/functions/seed.js) can sign in without a real
 * Firebase project or google-services.json.
 *
 * Applied only in debug builds (BuildConfig.USE_EMULATORS) from
 * WorkTrackApplication.onCreate, before any Firebase Auth usage.
 */
object EmulatorConfig {

    private const val TAG = "EmulatorConfig"

    // 10.0.2.2 is the host machine's loopback as seen from the Android emulator.
    private const val EMULATOR_HOST = "10.0.2.2"
    private const val AUTH_EMULATOR_PORT = 9099

    fun apply(context: Context) {
        // Without google-services.json the default FirebaseApp never auto-inits,
        // so create it here with demo options (any values are accepted by the
        // Auth emulator; the project id must match the emulator's project).
        if (FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(
                context,
                FirebaseOptions.Builder()
                    .setProjectId("demo-worktrack")
                    .setApplicationId("1:1234567890:android:demoworktrack")
                    .setApiKey("demo-key")
                    .build(),
            )
        }

        // Route Auth to the emulator. Safe to call once before any auth call;
        // guarded so a process relaunch (or double init) doesn't crash.
        runCatching {
            FirebaseAuth.getInstance().useEmulator(EMULATOR_HOST, AUTH_EMULATOR_PORT)
        }.onFailure { Log.w(TAG, "Auth emulator already configured: ${it.message}") }
    }
}

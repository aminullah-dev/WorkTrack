package app.worktrack

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import app.worktrack.core.designsystem.theme.WorkTrackTheme
import app.worktrack.ui.WorkTrackApp
import dagger.hilt.android.AndroidEntryPoint

// AppCompatActivity (not ComponentActivity) so AppCompatDelegate can apply the
// user's chosen app language (Dari/Pashto/English) on every API level.
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WorkTrackTheme {
                // The window itself has no themed background — the XML theme is
                // AppCompat only, so Compose has to paint it. Without this, any
                // screen that is not inside MainScaffold (the sign-in screen)
                // shows through to AppCompat's default grey instead of the
                // brand background.
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    WorkTrackApp()
                }
            }
        }
    }
}

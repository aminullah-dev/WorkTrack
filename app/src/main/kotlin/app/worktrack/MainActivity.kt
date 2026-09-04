package app.worktrack

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
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
                WorkTrackApp()
            }
        }
    }
}

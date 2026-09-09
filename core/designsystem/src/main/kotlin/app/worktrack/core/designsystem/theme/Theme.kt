package app.worktrack.core.designsystem.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

private val LightColors = lightColorScheme(
    primary = Blue40,
    onPrimary = Petrol99,
    primaryContainer = Blue90,
    onPrimaryContainer = Blue10,
    secondary = Petrol30,
    onSecondary = Petrol99,
    secondaryContainer = Petrol90,
    onSecondaryContainer = Petrol10,
    tertiary = Coral40,
    onTertiary = Petrol99,
    tertiaryContainer = Coral90,
    onTertiaryContainer = Coral10,
    error = Red40,
    onError = Petrol99,
    errorContainer = Red90,
    onErrorContainer = Red10,
    background = Petrol99,
    onBackground = Petrol10,
    surface = Surface0,
    onSurface = Petrol10,
    surfaceVariant = Petrol95,
    onSurfaceVariant = Petrol30,
    surfaceTint = Blue40,
    surfaceContainerLowest = Surface0,
    surfaceContainerLow = Petrol99,
    surfaceContainer = Petrol95,
    surfaceContainerHigh = SurfaceHighLight,
    surfaceContainerHighest = Petrol90,
    outline = PetrolOutline,
    outlineVariant = Petrol90,
)

private val DarkColors = darkColorScheme(
    primary = Blue80,
    onPrimary = Blue20,
    primaryContainer = Blue30,
    onPrimaryContainer = Blue90,
    secondary = Petrol80,
    onSecondary = Petrol20,
    secondaryContainer = Petrol30,
    onSecondaryContainer = Petrol90,
    tertiary = Coral80,
    onTertiary = Coral20,
    tertiaryContainer = Coral30,
    onTertiaryContainer = Coral90,
    error = Red80,
    onError = Red20,
    errorContainer = Red30,
    onErrorContainer = Red90,
    background = SurfaceDark0,
    onBackground = Petrol90,
    surface = SurfaceDark0,
    onSurface = Petrol90,
    surfaceVariant = Petrol30,
    onSurfaceVariant = Petrol80,
    surfaceTint = Blue80,
    surfaceContainerLowest = SurfaceDarkLowest,
    surfaceContainerLow = SurfaceDark1,
    surfaceContainer = SurfaceDark2,
    surfaceContainerHigh = SurfaceDark3,
    surfaceContainerHighest = Petrol30,
    outline = Petrol80,
    outlineVariant = Petrol30,
)

@Composable
fun WorkTrackTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Brand colors by default: a workforce app should look identical across the
    // fleet; dynamic color is an opt-in for personal devices.
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }

        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = WorkTrackTypography,
        shapes = WorkTrackShapes,
        content = content,
    )
}

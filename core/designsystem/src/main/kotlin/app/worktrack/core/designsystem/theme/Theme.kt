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
    primary = Teal40,
    onPrimary = Slate99,
    primaryContainer = Teal90,
    onPrimaryContainer = Teal10,
    secondary = Slate30,
    onSecondary = Slate99,
    secondaryContainer = Slate90,
    onSecondaryContainer = Slate10,
    tertiary = Orange40,
    onTertiary = Slate99,
    tertiaryContainer = Orange90,
    onTertiaryContainer = Orange10,
    error = Red40,
    onError = Slate99,
    errorContainer = Red90,
    onErrorContainer = Red10,
    background = Slate99,
    onBackground = Slate10,
    surface = Surface0,
    onSurface = Slate10,
    surfaceVariant = Slate95,
    onSurfaceVariant = Slate30,
    surfaceTint = Teal40,
    surfaceContainerLowest = Surface0,
    surfaceContainerLow = Slate99,
    surfaceContainer = Slate95,
    surfaceContainerHigh = SurfaceHighLight,
    surfaceContainerHighest = Slate90,
    outline = SlateOutline,
    outlineVariant = Slate90,
)

private val DarkColors = darkColorScheme(
    primary = Teal80,
    onPrimary = Teal20,
    primaryContainer = Teal30,
    onPrimaryContainer = Teal90,
    secondary = Slate80,
    onSecondary = Slate20,
    secondaryContainer = Slate30,
    onSecondaryContainer = Slate90,
    tertiary = Orange80,
    onTertiary = Orange20,
    tertiaryContainer = Orange30,
    onTertiaryContainer = Orange90,
    error = Red80,
    onError = Red20,
    errorContainer = Red30,
    onErrorContainer = Red90,
    background = SurfaceDark0,
    onBackground = Slate90,
    surface = SurfaceDark0,
    onSurface = Slate90,
    surfaceVariant = Slate30,
    onSurfaceVariant = Slate80,
    surfaceTint = Teal80,
    surfaceContainerLowest = SurfaceDarkLowest,
    surfaceContainerLow = SurfaceDark1,
    surfaceContainer = SurfaceDark2,
    surfaceContainerHigh = SurfaceDark3,
    surfaceContainerHighest = Slate30,
    outline = Slate80,
    outlineVariant = Slate30,
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

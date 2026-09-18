package app.worktrack.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.worktrack.core.designsystem.theme.StatusAmber
import app.worktrack.core.designsystem.theme.StatusAmberContainer
import app.worktrack.core.designsystem.theme.StatusGreen
import app.worktrack.core.designsystem.theme.StatusGreenContainer
import app.worktrack.core.designsystem.theme.StatusNeutral
import app.worktrack.core.designsystem.theme.StatusNeutralContainer
import app.worktrack.core.designsystem.theme.StatusRed
import app.worktrack.core.designsystem.theme.StatusRedContainer

/** Semantic tone for status chips, mapped from domain enums at the call site. */
enum class ChipTone { POSITIVE, WARNING, NEGATIVE, NEUTRAL }

@Composable
fun StatusChip(
    text: String,
    tone: ChipTone,
    modifier: Modifier = Modifier,
) {
    val (container, content) = when (tone) {
        ChipTone.POSITIVE -> StatusGreenContainer to StatusGreen
        ChipTone.WARNING -> StatusAmberContainer to StatusAmber
        ChipTone.NEGATIVE -> StatusRedContainer to StatusRed
        ChipTone.NEUTRAL -> StatusNeutralContainer to StatusNeutral
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium,
        color = content,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(container)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun ColorDotChip(
    text: String,
    dotColor: Color,
    modifier: Modifier = Modifier,
) {
    Text(
        text = "● $text",
        style = MaterialTheme.typography.labelMedium,
        color = dotColor,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

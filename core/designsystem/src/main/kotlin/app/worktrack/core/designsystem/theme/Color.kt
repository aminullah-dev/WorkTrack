package app.worktrack.core.designsystem.theme

import androidx.compose.ui.graphics.Color

// WorkTrack brand palette.
//
// Deep blue #004E72 primary, coral #FF6D41 accent, on petrol #0A2735 and
// near-white #F9F9F9. Every on/container pair below was checked against WCAG AA
// for the Material 3 role it fills.
//
// Two tones are deliberately NOT the raw brand values: the light theme's
// tertiary is a darkened coral, because white text on #FF6D41 measures 2.65:1
// and fails. The brand coral lives at tone 80, where it carries dark text.

val Blue10 = Color(0xFF002333)
val Blue20 = Color(0xFF004666)
val Blue30 = Color(0xFF006999)
val Blue40 = Color(0xFF004E72)
val Blue80 = Color(0xFFB0D6E8)
val Blue90 = Color(0xFFD7EBF4)

val Petrol10 = Color(0xFF0A2735)
val Petrol20 = Color(0xFF103F56)
val Petrol30 = Color(0xFF185F81)
val Petrol80 = Color(0xFFB9D3DF)
val Petrol90 = Color(0xFFDCE9EF)
val Petrol95 = Color(0xFFEDF4F7)
val Petrol99 = Color(0xFFF9F9F9)
val PetrolOutline = Color(0xFF6B8A99)

// Layered light surfaces for a subtle elevation hierarchy (cards on background).
val Surface0 = Color(0xFFFFFFFF)
val SurfaceHighLight = Color(0xFFEEF3F6)

// Layered dark surfaces: near-black base with progressively lighter containers.
val SurfaceDarkLowest = Color(0xFF061A24)
val SurfaceDark0 = Color(0xFF0A2735)
val SurfaceDark1 = Color(0xFF0E2E3E)
val SurfaceDark2 = Color(0xFF123646)
val SurfaceDark3 = Color(0xFF173E50)

val Amber10 = Color(0xFF261A00)
val Amber20 = Color(0xFF402D00)
val Amber30 = Color(0xFF5C4200)
val Amber40 = Color(0xFF7A5900)
val Amber80 = Color(0xFFFABD1B)
val Amber90 = Color(0xFFFFDF9E)

// Secondary accent — coral (M3 tertiary role), matches the web portal.
val Coral10 = Color(0xFF330C00)
val Coral20 = Color(0xFF601700)
val Coral30 = Color(0xFF992300)
val Coral40 = Color(0xFFCC2F00)
val Coral80 = Color(0xFFFF6D41)
val Coral90 = Color(0xFFF4DED7)

val Red10 = Color(0xFF410002)
val Red20 = Color(0xFF690005)
val Red30 = Color(0xFF93000A)
val Red40 = Color(0xFFBA1A1A)
val Red80 = Color(0xFFFFB4AB)
val Red90 = Color(0xFFFFDAD6)

// Semantic status colors (used by StatusChip; stable across light/dark).
val StatusGreen = Color(0xFF2E7D32)
val StatusGreenContainer = Color(0xFFC8E6C9)
val StatusAmber = Color(0xFF9A6B00)
val StatusAmberContainer = Color(0xFFFFE8B3)
val StatusRed = Color(0xFFB3261E)
val StatusRedContainer = Color(0xFFF9DEDC)
val StatusNeutral = Color(0xFF44606E)
val StatusNeutralContainer = Color(0xFFDFE9EE)

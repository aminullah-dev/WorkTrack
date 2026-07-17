package app.worktrack.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.worktrack.core.common.result.AppError
import app.worktrack.core.common.result.AppResult
import app.worktrack.core.domain.usecase.auth.SignInUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val passwordVisible: Boolean = false,
    val isSubmitting: Boolean = false,
    /** Field keys with validation problems; the UI maps keys to localized text. */
    val fieldErrors: Set<String> = emptySet(),
    val error: AppError? = null,
)

/**
 * Sign-in flow. Successful sign-in persists the session; the root nav host
 * observes the session and switches to the main graph — no nav event needed.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val signIn: SignInUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, fieldErrors = it.fieldErrors - "email", error = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, fieldErrors = it.fieldErrors - "password", error = null) }
    }

    fun onTogglePasswordVisibility() {
        _uiState.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    fun onSubmit() {
        val state = _uiState.value
        if (state.isSubmitting) return
        _uiState.update { it.copy(isSubmitting = true, error = null, fieldErrors = emptySet()) }

        viewModelScope.launch {
            when (val result = signIn(state.email, state.password)) {
                is AppResult.Success -> _uiState.update { it.copy(isSubmitting = false) }
                is AppResult.Failure -> _uiState.update {
                    val validation = result.error as? AppError.Validation
                    it.copy(
                        isSubmitting = false,
                        fieldErrors = validation?.fieldErrors?.keys.orEmpty(),
                        // Field-level problems are surfaced inline, not as a banner.
                        error = if (validation == null) result.error else null,
                    )
                }
            }
        }
    }
}

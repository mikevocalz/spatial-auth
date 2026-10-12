package expo.modules.spatialauth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Loaded only on builds carrying Google Play Services / Credential Manager.
 * Google ID tokens must be verified by Better Auth's Google provider.
 */
internal object GoogleCredentialBridge {
    suspend fun getIdToken(activity: Activity, webClientId: String, nonce: String): Map<String, String> {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(webClientId)
            .setNonce(nonce)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()
        val response = CredentialManager.create(activity).getCredential(
            context = activity,
            request = request
        )
        val custom = response.credential as? CustomCredential
            ?: error("Credential Manager returned a non-Google credential")
        if (custom.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            error("Credential Manager returned a different credential type")
        }
        return mapOf("idToken" to GoogleIdTokenCredential.createFrom(custom.data).idToken)
    }
}

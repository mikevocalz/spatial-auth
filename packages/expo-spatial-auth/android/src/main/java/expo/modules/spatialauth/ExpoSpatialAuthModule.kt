package expo.modules.spatialauth

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Modules v2 cross-platform boundary.
 *
 * Meta Horizon and Google Credential Manager are loaded in separate bridge
 * classes so ART never eagerly resolves absent SDKs on PICO or other flavors.
 */
class ExpoSpatialAuthModule : Module() {
    private fun isMeta(): Boolean {
        // Quest/Simulator detection uses runtime capability, not manufacturer
        // strings: simulator builds do not necessarily report Meta hardware.
        if (BuildConfig.META_HORIZON_APP_ID.isBlank()) return false
        return runCatching { Class.forName("horizon.platform.users.Users") }.isSuccess
    }

    override fun definition() = ModuleDefinition {
        Name("ExpoSpatialAuth")

        Function("getPlatform") {
            when {
                isMeta() -> "meta-horizon"
                Build.MANUFACTURER.equals("Pico", ignoreCase = true) ||
                    Build.BRAND.equals("PICO", ignoreCase = true) -> "pico"
                else -> "android"
            }
        }

        AsyncFunction("getMetaUserProfile") Coroutine {
            if (!isMeta()) error("Meta Horizon OS identity is unavailable on this device")
            val context = appContext.reactContext?.applicationContext
                ?: error("React context is unavailable")
            MetaHorizonBridge.getProfile(context, BuildConfig.META_HORIZON_APP_ID)
        }

        AsyncFunction("getMetaUserProof") Coroutine {
            if (!isMeta()) error("Meta Horizon OS identity is unavailable on this device")
            val context = appContext.reactContext?.applicationContext
                ?: error("React context is unavailable")
            MetaHorizonBridge.getProof(context, BuildConfig.META_HORIZON_APP_ID)
        }

        AsyncFunction("getGoogleIdToken") Coroutine { webClientId: String, nonce: String ->
            if (webClientId.isBlank() || nonce.isBlank()) {
                error("Google web client ID and nonce are required")
            }
            val credentialSdkAvailable = runCatching {
                Class.forName("androidx.credentials.CredentialManager")
                Class.forName("com.google.android.libraries.identity.googleid.GoogleIdTokenCredential")
            }.isSuccess
            if (!credentialSdkAvailable) {
                error("Google Credential Manager is not installed in this Android build flavor")
            }
            val activity = appContext.currentActivity
                ?: error("Google Credential Manager requires a foreground Activity")
            GoogleCredentialBridge.getIdToken(activity, webClientId, nonce)
        }
    }
}

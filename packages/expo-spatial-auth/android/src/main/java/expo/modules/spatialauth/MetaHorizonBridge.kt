package expo.modules.spatialauth

import android.content.Context
import horizon.core.android.driver.coroutines.HorizonServiceConnection
import horizon.platform.users.Users
import kotlinx.coroutines.sync.Mutex

/**
 * Loaded only when the device and flavor both support Meta Horizon.
 * The SDK must establish its service connection before Users() calls.
 */
internal object MetaHorizonBridge {
    private val connectMutex = Mutex()
    @Volatile private var connected = false

    private suspend fun connect(context: Context, appId: String) {
        if (appId.isBlank()) error("Meta App ID is not configured in expo-horizon-core")
        connectMutex.lock()
        try {
            if (!connected) {
                HorizonServiceConnection.connect(appId, context)
                connected = true
            }
        } finally {
            connectMutex.unlock()
        }
    }

    suspend fun getProfile(context: Context, appId: String): Map<String, String?> {
        connect(context, appId)
        val user = Users().getLoggedInUser()
        if (user.id.isBlank()) error("No Meta Horizon account is signed in")
        return mapOf(
            "userId" to user.id,
            "displayName" to user.displayName,
            "avatarUrl" to user.imageUrl
        )
    }

    suspend fun getProof(context: Context, appId: String): Map<String, String?> {
        connect(context, appId)
        val users = Users()
        val user = users.getLoggedInUser()
        if (user.id.isBlank()) error("No Meta Horizon account is signed in")
        val proof = users.getUserProof()
        if (proof.nonce.isBlank()) error("Meta returned an empty user proof")
        return mapOf(
            "userId" to user.id,
            "nonce" to proof.nonce,
            "displayName" to user.displayName,
            "avatarUrl" to user.imageUrl
        )
    }
}

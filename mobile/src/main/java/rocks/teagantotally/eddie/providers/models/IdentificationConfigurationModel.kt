package rocks.teagantotally.eddie.providers.models

import android.os.Parcelable
import kotlinx.android.parcel.Parcelize

/**
 * Created by tglenn on 2/17/18.
 */
@Parcelize
data class IdentificationConfigurationModel(
    val deviceId: String?,
    val useAuth: Boolean?,
    val userName: String?,
    val password: String?
                                           ) : Parcelable
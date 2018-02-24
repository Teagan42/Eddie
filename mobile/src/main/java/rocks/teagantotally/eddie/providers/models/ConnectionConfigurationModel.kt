package rocks.teagantotally.eddie.providers.models

import android.net.Uri
import android.os.Parcelable
import kotlinx.android.parcel.Parcelize

/**
 * Created by tglenn on 2/15/18.
 */
@Parcelize
data class ConnectionConfigurationModel(
    var brokerUri: Uri?,
    var connectionTimeout: Int?,
    var resendDelay: Int?,
    var blockingTimeout: Int?,
    var keepAlive: Int?
                                       ) : Parcelable
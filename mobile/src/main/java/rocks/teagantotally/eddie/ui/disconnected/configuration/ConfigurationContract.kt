package rocks.teagantotally.eddie.ui.disconnected.configuration

import rocks.teagantotally.eddie.di.mvp.MVPContract
import rocks.teagantotally.eddie.providers.models.ConnectionConfigurationModel
import rocks.teagantotally.eddie.providers.models.IdentificationConfigurationModel

/**
 * Created by tglenn on 2/16/18.
 */

interface ConfigurationContract {
    interface Presenter : MVPContract.Presenter {
        fun getHostConfiguration()

        fun getIdentificationConfiguration()

        fun saveConnectionConfiguration(
            brokerUri: String,
            connectionTimeout: Int,
            resendDelay: Int,
            blockingTimeout: Int,
            keepAlive: Int
                                       )

        fun saveIdentificationConfiguration(
            deviceId: String?,
            useAuth: Boolean?,
            username: String?,
            password: String?
                                           )
    }

    interface HostView : MVPContract.View {
        fun show(configuration: ConnectionConfigurationModel?)

        fun onSaveComplete()
    }

    interface IdentificationView : MVPContract.View {
        fun show(configuration: IdentificationConfigurationModel?)

        fun onSaveComplete()
    }
}
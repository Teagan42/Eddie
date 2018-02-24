package rocks.teagantotally.eddie.ui.disconnected.configuration

import rocks.teagantotally.eddie.providers.ConfigurationProvider
import rocks.teagantotally.eddie.utils.extensions.toUri
import javax.inject.Inject

/**
 * Created by tglenn on 2/16/18.
 */
class ConfigurationPresenter
@Inject constructor(
    private val configurationProvider: ConfigurationProvider?,
    private val hostView: ConfigurationContract.HostView?,
    private val identificationView: ConfigurationContract.IdentificationView?
                   ) : ConfigurationContract.Presenter {

    override fun getHostConfiguration() {
        hostView?.show(configurationProvider?.getConnectionConfiguration())
    }

    override fun getIdentificationConfiguration() {
        identificationView?.show(configurationProvider?.getIdentificatonConfiguration())
    }

    override fun saveConnectionConfiguration(
        brokerUri: String,
        connectionTimeout: Int,
        resendDelay: Int,
        blockingTimeout: Int,
        keepAlive: Int
                                            ) {
        configurationProvider?.saveConnectionConfiguration(
            brokerUri.toUri(),
            connectionTimeout,
            resendDelay,
            blockingTimeout,
            keepAlive
                                                          ).also {
            hostView?.onSaveComplete()
        }
    }

    override fun saveIdentificationConfiguration(
        deviceId: String?,
        useAuth: Boolean?,
        username: String?,
        password: String?
                                                ) {
        configurationProvider?.saveIdentificationConfiguration(
            deviceId,
            useAuth,
            username,
            password
                                                              ).also {
            identificationView?.onSaveComplete()
        }
    }
}
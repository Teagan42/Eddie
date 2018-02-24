package rocks.teagantotally.eddie.providers

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.providers.models.ConnectionConfigurationModel
import rocks.teagantotally.eddie.providers.models.IdentificationConfigurationModel
import rocks.teagantotally.eddie.utils.extensions.edit
import rocks.teagantotally.eddie.utils.extensions.toUri
import javax.inject.Inject

/**
 * Created by tglenn on 2/15/18.
 */
class ConfigurationProvider
@Inject constructor(
    private val context: Context,
    private val sharedPreferences: SharedPreferences
                   ) {
    companion object {
        private const val DEFAULT_CONNECTION_TIMEOUT = 30
        private const val DEFAULT_RESEND_DELAY = 30
        private const val DEFAULT_BLOCKING_TIMEOUT = 0
        private const val DEFAULT_KEEP_ALIVE = 300
    }

    fun getConnectionConfiguration(): ConnectionConfigurationModel =
        with(context) {
            sharedPreferences.let {
                ConnectionConfigurationModel(
                    it.getString(
                        getString(R.string.pref_broker_uri),
                        ""
                                )?.toUri(),
                    it.getInt(
                        getString(R.string.pref_connection_timeout),
                        DEFAULT_CONNECTION_TIMEOUT
                             ),
                    it.getInt(getString(R.string.pref_resend_delay), DEFAULT_RESEND_DELAY),
                    it.getInt(getString(R.string.pref_blocking_timeout), DEFAULT_BLOCKING_TIMEOUT),
                    it.getInt(getString(R.string.pref_keep_alive), DEFAULT_KEEP_ALIVE)
                                            )
            }
        }

    fun getIdentificatonConfiguration(): IdentificationConfigurationModel =
        with(context) {
            sharedPreferences.let {
                IdentificationConfigurationModel(
                    it.getString(
                        getString(R.string.pref_device_id),
                        ""
                                ),
                    it.getBoolean(
                        getString(R.string.pref_use_auth),
                        false
                                 ),
                    it.getString(
                        getString(R.string.pref_username),
                        ""
                                ),
                    it.getString(
                        getString(R.string.pref_password),
                        ""
                                )
                                                )
            }
        }

    fun saveConnectionConfiguration(
        brokerUri: Uri?,
        connectionTimeout: Int,
        resendDelay: Int,
        blockingTimeout: Int,
        keepAlive: Int
                                   ) =
        sharedPreferences.edit {
            context.let {
                putString(
                    it.getString(R.string.pref_broker_uri),
                    brokerUri?.toString()
                         )
                putInt(
                    it.getString(R.string.pref_connection_timeout),
                    connectionTimeout
                      )
                putInt(
                    it.getString(R.string.pref_resend_delay),
                    resendDelay
                      )
                putInt(
                    it.getString(R.string.pref_blocking_timeout),
                    blockingTimeout
                      )
                putInt(
                    it.getString(R.string.pref_keep_alive),
                    keepAlive
                      )
            }
        }

    fun saveIdentificationConfiguration(
        deviceId: String?,
        useAuth: Boolean?,
        username: String?,
        password: String?
                                       ) =
        sharedPreferences.edit {
            context.let {
                putString(
                    it.getString(R.string.pref_device_id),
                    deviceId
                         )
                putBoolean(
                    it.getString(R.string.pref_use_auth),
                    useAuth ?: false
                          )
                putString(
                    it.getString(R.string.pref_username),
                    username
                         )
                putString(
                    it.getString(R.string.pref_password),
                    password
                         )
            }
        }
}
package rocks.teagantotally.eddie.ui.disconnected.configuration

import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.view.Menu
import android.view.View
import android.widget.EditText
import kotlinx.android.synthetic.main.fragment_config_host.*
import net.sf.xenqtt.client.MqttClientConfig
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.di.mvp.modules.HostConfigurationModule
import rocks.teagantotally.eddie.providers.models.ConnectionConfigurationModel
import rocks.teagantotally.eddie.ui.BaseActivity
import rocks.teagantotally.eddie.ui.annotations.ActionBar
import rocks.teagantotally.eddie.ui.annotations.Layout
import rocks.teagantotally.eddie.ui.base.SaveFragment
import rocks.teagantotally.eddie.ui.validation.EditTextValidationHandler
import rocks.teagantotally.eddie.ui.validation.IntRangeValidationHandler
import rocks.teagantotally.eddie.ui.validation.UriValidationhandler
import rocks.teagantotally.eddie.ui.validation.ValidationHandled
import rocks.teagantotally.eddie.utils.extensions.ifTrue
import rocks.teagantotally.eddie.utils.extensions.toUri
import timber.log.Timber
import javax.inject.Inject

/**
 * Created by tglenn on 2/10/18.
 */
@Layout(R.layout.fragment_config_host)
@ActionBar(titleResourceId = R.string.title_host_config)
class HostConfigurationFragment : SaveFragment(),
                                  ConfigurationContract.HostView {
    companion object {
        const val TAG = "HostConfigurationFrag"
        const val FIELD_BROKER_URI = "BROKER_URI"
        const val FIELD_CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT"
        const val FIELD_RESEND_DELAY = "RESEND_DELAY"
        const val FIELD_BLOCKING_TIMEOUT = "BLOCKING_TIMEOUT"
        const val FIELD_KEEP_ALIVE = "KEEP_ALIVE"

        fun create(
            brokerUri: String? = null,
            connectionTimeout: Int? = null,
            resendDelay: Int? = null,
            blockingTimeOut: Int? = null,
            keepAlive: Int? = null
                  ): HostConfigurationFragment {
            val fragment = HostConfigurationFragment()
            with(Bundle()) {
                brokerUri?.let {
                    putString(
                        FIELD_BROKER_URI,
                        it
                             )
                }
                connectionTimeout?.let {
                    putInt(
                        FIELD_BROKER_URI,
                        it
                          )
                }
                resendDelay?.let {
                    putInt(
                        FIELD_RESEND_DELAY,
                        it
                          )
                }
                blockingTimeOut?.let {
                    putInt(
                        FIELD_BLOCKING_TIMEOUT,
                        it
                          )
                }
                keepAlive?.let {
                    putInt(
                        FIELD_KEEP_ALIVE,
                        it
                          )
                }

                fragment.arguments = this
            }

            return fragment
        }
    }

    private var optionsMenu: Menu? = null

    private var config = MqttClientConfig()
    private var brokerUri: Uri? = null

    private var brokerUriValid: Boolean = false
    private var connectionTimeoutValid: Boolean = false
    private var resendDelayValid: Boolean = false
    private var blockingTimeoutValid: Boolean = false
    private var keepAliveValid: Boolean = false

    @Inject
    lateinit var presenter: ConfigurationContract.Presenter

    private val validationCallback =
        object : ValidationHandled<CharSequence, EditText> {
            override fun onValidationHandled(
                value: CharSequence,
                view: EditText,
                valid: Boolean
                                            ) {
                when (view.tag) {
                    FIELD_BROKER_URI         -> {
                        brokerUriValid = valid
                    }
                    FIELD_CONNECTION_TIMEOUT -> {
                        connectionTimeoutValid = valid
                        valid.ifTrue {
                            config.connectTimeoutSeconds =
                                    connection_timeout.text.toString().toInt()
                        }
                    }
                    FIELD_RESEND_DELAY       -> {
                        resendDelayValid = valid
                        valid.ifTrue {
                            config.messageResendIntervalSeconds =
                                    resend_timeout.text.toString().toInt()
                        }
                    }
                    FIELD_BLOCKING_TIMEOUT   -> {
                        blockingTimeoutValid = valid
                        valid.ifTrue {
                            config.blockingTimeoutSeconds =
                                    blocking_timeout.text.toString().toInt()
                        }
                    }
                    FIELD_KEEP_ALIVE         -> {
                        keepAliveValid = valid
                        valid.ifTrue {
                            config.keepAliveSeconds =
                                    keep_alive.text.toString().toInt()
                        }
                    }
                }

                enableSaveMenuOption(isValid())
            }
        }

    private val uriValidationHandler =
        UriValidationhandler(
            "Invalid uri",
            validationCallback
                            )
    private val connectionTimeout =
        IntRangeValidationHandler(
            min = 1,
            max = 360,
            errorFormat = "Must be between %d and %d seconds",
            callback = validationCallback
                                 )
    private val resendDelay =
        IntRangeValidationHandler(
            min = 1,
            max = 30,
            errorFormat = "Must be between %d and %d seconds",
            callback = validationCallback
                                 )
    private val blockingTimeout =
        IntRangeValidationHandler(
            min = 0,
            max = 10,
            errorFormat = "Must be between %d and %d seconds",
            callback = validationCallback
                                 )
    private val keepAlive =
        IntRangeValidationHandler(
            min = 1,
            max = 3600,
            errorFormat = "Must be between %d and %d seconds",
            callback = validationCallback
                                 )

    override fun isValid(): Boolean =
        brokerUriValid
                && connectionTimeoutValid
                && resendDelayValid
                && blockingTimeoutValid
                && keepAliveValid

    override fun save() =
        when (isValid()) {
            false -> Timber.tag(TAG).d("Form is invalid")
            true  -> presenter.saveConnectionConfiguration(
                uri.text.toString(),
                connection_timeout.text.toString().toInt(),
                resend_timeout.text.toString().toInt(),
                blocking_timeout.text.toString().toInt(),
                keep_alive.text.toString().toInt()
                                                          )
        }

    override fun initialize() {
        arguments?.apply {
            val brokerUri =
                getString(
                    FIELD_BROKER_URI,
                    ""
                         ).toUri()

            val connectionTimeout =
                getInt(
                    FIELD_CONNECTION_TIMEOUT,
                    config.connectTimeoutSeconds
                      )

            val blockingTimeOut =
                getInt(
                    FIELD_BLOCKING_TIMEOUT,
                    config.blockingTimeoutSeconds
                      )

            val resendDelay =
                getInt(
                    FIELD_RESEND_DELAY,
                    config.messageResendIntervalSeconds
                      )

            val keepAlive =
                getInt(
                    FIELD_KEEP_ALIVE,
                    config.keepAliveSeconds
                      )

            show(
                ConnectionConfigurationModel(
                    brokerUri,
                    connectionTimeout,
                    resendDelay, blockingTimeOut, keepAlive
                                            )
                )
        } ?: presenter.getHostConfiguration()
    }

    /**
     * Called immediately after [.onCreateView]
     * has returned, but before any saved state has been restored in to the view.
     * This gives subclasses a chance to initialize themselves once
     * they know their view hierarchy has been completely created.  The fragment's
     * view hierarchy is not however attached to its parent at this point.
     * @param view The View returned by [.onCreateView].
     * @param savedInstanceState If non-null, this fragment is being re-constructed
     * from a previous saved state as given here.
     */
    override fun onViewCreated(
        view: View?,
        savedInstanceState: Bundle?
                              ) {
        with(uri) {
            EditTextValidationHandler.onTextChanged(uriValidationHandler, this)
            tag = FIELD_BROKER_URI
            text = Editable.Factory
                .getInstance()
                .newEditable(brokerUri?.toString() ?: "")
        }
        with(connection_timeout) {
            EditTextValidationHandler.onTextChanged(connectionTimeout, this)
            tag = FIELD_CONNECTION_TIMEOUT
            text = Editable.Factory
                .getInstance()
                .newEditable(config.connectTimeoutSeconds.toString())
        }
        with(resend_timeout) {
            EditTextValidationHandler.onTextChanged(resendDelay, this)
            tag = FIELD_RESEND_DELAY
            text = Editable.Factory
                .getInstance()
                .newEditable(config.messageResendIntervalSeconds.toString())
        }
        with(blocking_timeout) {
            EditTextValidationHandler.onTextChanged(blockingTimeout, this)
            tag = FIELD_BLOCKING_TIMEOUT
            text = Editable.Factory
                .getInstance()
                .newEditable(config.blockingTimeoutSeconds.toString())
        }
        with(keep_alive) {
            EditTextValidationHandler.onTextChanged(keepAlive, this)
            tag = FIELD_KEEP_ALIVE
            text = Editable.Factory
                .getInstance()
                .newEditable(config.keepAliveSeconds.toString())
        }
    }

    override fun show(configuration: ConnectionConfigurationModel?) {
        configuration?.let {
            brokerUri = it.brokerUri
            config.connectTimeoutSeconds =
                    it.connectionTimeout ?: config.connectTimeoutSeconds
            config.messageResendIntervalSeconds =
                    it.resendDelay ?: config.messageResendIntervalSeconds
            config.blockingTimeoutSeconds =
                    it.blockingTimeout ?: config.blockingTimeoutSeconds
            config.keepAliveSeconds =
                    it.keepAlive ?: config.keepAliveSeconds
        }
    }

    override fun onSaveComplete() {
        IdentificationConfigurationFragment().let {
            (activity as? BaseActivity)?.setFragment(it, addToBackStack = true)
        }
    }

    override fun injectDependencies() {
        Injector.get()?.components()?.setHostConfiguration(HostConfigurationModule(this))
            ?.inject(this)
    }
}
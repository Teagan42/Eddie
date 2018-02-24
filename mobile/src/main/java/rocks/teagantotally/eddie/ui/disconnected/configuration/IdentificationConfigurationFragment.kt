package rocks.teagantotally.eddie.ui.disconnected.configuration

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.view.View
import android.widget.EditText
import kotlinx.android.synthetic.main.fragment_config_identification.*
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.di.mvp.modules.IdentificationConfigurationModule
import rocks.teagantotally.eddie.providers.models.IdentificationConfigurationModel
import rocks.teagantotally.eddie.ui.annotations.ActionBar
import rocks.teagantotally.eddie.ui.annotations.Layout
import rocks.teagantotally.eddie.ui.base.SaveFragment
import rocks.teagantotally.eddie.ui.disconnected.connect.ConnectActivity
import rocks.teagantotally.eddie.ui.validation.EditTextValidationHandler
import rocks.teagantotally.eddie.ui.validation.RegexValidationHandler
import rocks.teagantotally.eddie.ui.validation.ValidationHandled
import timber.log.Timber
import java.util.regex.Pattern
import javax.inject.Inject

/**
 * Created by tglenn on 2/13/18.
 */

@Layout(R.layout.fragment_config_identification)
@ActionBar(titleResourceId = R.string.title_identification_config)
class IdentificationConfigurationFragment : SaveFragment(),
                                            ConfigurationContract.IdentificationView {
    companion object {
        const val TAG = "IdConfigFragment"
        const val FIELD_CLIENT_ID = "CLIENT_ID"
        const val FIELD_USE_AUTH = "USE_AUTH"
        const val FIELD_USERNAME = "USERNAME"
        const val FIELD_PASSWORD = "PASSWORD"

        fun create(
            clientId: String? = null,
            useAuth: Boolean? = null,
            username: String? = null,
            password: String? = null
                  ): IdentificationConfigurationFragment {
            Bundle().let {
                it.putString(FIELD_CLIENT_ID, clientId)
                it.putString(FIELD_USERNAME, username)
                it.putString(FIELD_PASSWORD, password)
                with(IdentificationConfigurationFragment()) {
                    arguments = it
                    return this
                }
            }
        }
    }

    @Inject
    lateinit var presenter: ConfigurationPresenter

    private var deviceId: String? = null
    private var useAuth: Boolean = false
    private var username: String? = null
    private var password: String? = null

    private var deviceIdValid: Boolean = false
    private var usernamValid: Boolean = false
    private var passwordValid: Boolean = false

    private val validationCallack =
        object : ValidationHandled<CharSequence, EditText> {
            override fun onValidationHandled(value: CharSequence, view: EditText, valid: Boolean) {
                when (view.tag) {
                    FIELD_CLIENT_ID -> deviceIdValid = valid
                    FIELD_USERNAME  -> usernamValid = valid
                    FIELD_PASSWORD  -> passwordValid = valid
                }

                enableSaveMenuOption(isValid())
            }
        }

    private val deviceIdHandler = RegexValidationHandler(
        Pattern.compile(".+"),
        "Must be provided",
        validationCallack
                                                        )
    private val usernameHandler = RegexValidationHandler(
        Pattern.compile(".+"),
        "Must be provided",
        validationCallack
                                                        )
    private val passwordHandler = RegexValidationHandler(
        Pattern.compile(".+"),
        "Must be provided",
        validationCallack
                                                        )

    override fun initialize() {
        arguments?.apply {
            show(
                IdentificationConfigurationModel(
                    getString(FIELD_CLIENT_ID, ""),
                    getBoolean(FIELD_USE_AUTH, false),
                    getString(FIELD_USERNAME, ""),
                    getString(FIELD_PASSWORD, "")
                                                )
                )
        } ?: presenter.getIdentificationConfiguration()
    }

    override fun show(configuration: IdentificationConfigurationModel?) {
        configuration?.let {
            deviceId = it.deviceId
            useAuth = it.useAuth ?: false
            username = it.userName
            password = it.password
        }
    }

    override fun isValid(): Boolean = deviceIdValid && (!useAuth || (usernamValid && passwordValid))

    override fun save() {
        when (isValid()) {
            false -> Timber.tag(TAG).d("Form is invalid")
            true  -> presenter.saveIdentificationConfiguration(
                client_id.text.toString(),
                enable_auth.isChecked,
                auth_user.text.toString(),
                auth_password.text.toString()
                                                              )
        }
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
        with(client_id) {
            EditTextValidationHandler.onTextChanged(deviceIdHandler, this)
            tag = FIELD_CLIENT_ID
            text = Editable.Factory.getInstance().newEditable(deviceId)
        }
        with(enable_auth) {
            setOnCheckedChangeListener { compoundButton, checked ->
                useAuth = checked
                auth_layout.visibility = if (checked) View.VISIBLE else View.GONE
            }
            isChecked = useAuth
        }
        with(auth_user) {
            EditTextValidationHandler.onTextChanged(usernameHandler, this)
            tag = FIELD_USERNAME
            text = Editable.Factory.getInstance().newEditable(username)
        }
        with(auth_password) {
            EditTextValidationHandler.onTextChanged(passwordHandler, this)
            tag = FIELD_PASSWORD
            text = Editable.Factory.getInstance().newEditable(password)
        }
    }

    override fun injectDependencies() {
        Injector.get()?.components()?.setIdentificationConfiguration(
            IdentificationConfigurationModule(this)
                                                                    )?.inject(this)
    }

    override fun onSaveComplete() {
        activity?.startActivity(Intent(context, ConnectActivity::class.java))
    }
}
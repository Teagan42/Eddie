package rocks.teagantotally.eddie.ui.validation

import android.support.design.widget.TextInputEditText
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.EditText
import rocks.teagantotally.eddie.utils.extensions.getInputLayout
import rocks.teagantotally.eddie.utils.extensions.ifFalse

/**
 * Created by tglenn on 2/10/18.
 */
abstract class EditTextValidationHandler(callback: ValidationHandled<CharSequence, EditText>?) :
    ValidationHandler<CharSequence, EditText>(callback) {

    companion object {
        fun onLoseFocus(
            handler: EditTextValidationHandler,
            view: EditText
                       ) {
            view.onFocusChangeListener = View.OnFocusChangeListener { v, hasFocus ->
                hasFocus.ifFalse {
                    with(v as TextInputEditText) {
                        handler.validate(
                            v,
                            v.text.toString()
                                        )
                    }
                }
            }
        }

        fun onTextChanged(
            handler: EditTextValidationHandler,
            view: EditText
                         ) {
            val watcher = object : TextWatcher {
                override fun afterTextChanged(value: Editable?) {
                    handler.validate(
                        view,
                        value.toString()
                                    )
                }

                override fun beforeTextChanged(
                    value: CharSequence?,
                    start: Int,
                    count: Int,
                    after: Int
                                              ) {
                }

                override fun onTextChanged(
                    value: CharSequence?,
                    start: Int,
                    before: Int,
                    count: Int
                                          ) {
                }
            }
            view.addTextChangedListener(watcher)
        }
    }

    abstract var errorMessage: String

    override fun onValid(
        view: EditText,
        value: CharSequence
                        ) {
        view.getInputLayout()
            ?.let {
                it.error = null
                it.isErrorEnabled = false
            }
    }

    override fun onInvalid(
        view: EditText,
        value: CharSequence
                          ) {
        view.getInputLayout()
            ?.let {
                it.error = errorMessage
                it.isErrorEnabled = true
            }
    }
}
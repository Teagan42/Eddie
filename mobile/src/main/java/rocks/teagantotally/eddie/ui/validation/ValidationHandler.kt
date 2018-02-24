package rocks.teagantotally.eddie.ui.validation

import android.view.View

/**
 * Created by tglenn on 2/10/18.
 */

abstract class ValidationHandler<InputType, ViewType : View>(
    val callback: ValidationHandled<InputType, ViewType>? = null
                                                            ) {
    private var valid: Boolean = false
    private var value: InputType? = null

    abstract fun isValid(value: InputType): Boolean

    fun isValid(): Boolean = valid

    fun value(): InputType? = value

    fun validate(
        view: ViewType,
        value: InputType
                ) {
        this.value = value
        valid = isValid(value)
        when (valid) {
            true  -> onValid(
                view,
                value
                            )
            false -> onInvalid(
                view,
                value
                              )
        }

        callback?.onValidationHandled(
            value,
            view,
            valid
                                     )
    }

    open fun onValid(
        view: ViewType,
        value: InputType
                    ) {

    }

    open fun onInvalid(
        view: ViewType,
        value: InputType
                      ) {

    }
}
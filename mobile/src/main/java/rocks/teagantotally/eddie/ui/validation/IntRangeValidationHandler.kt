package rocks.teagantotally.eddie.ui.validation

import android.widget.EditText

/**
 * Created by tglenn on 2/13/18.
 */

class IntRangeValidationHandler(
    val min: Int,
    val max: Int,
    val errorFormat: String = "Must be between %d and %d",
    callback: ValidationHandled<CharSequence, EditText>? = null
                               ) : EditTextValidationHandler(callback) {

    override fun isValid(value: CharSequence): Boolean {
        val intVal = value.toString().toIntOrNull()
        return intVal != null && intVal >= min && intVal <= max
    }

    override var errorMessage: String
        get() = errorFormat.format(
            min,
            max
                                  )
        set(value) {}
}
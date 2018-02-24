package rocks.teagantotally.eddie.ui.validation

import android.widget.EditText
import java.util.regex.Pattern

/**
 * Created by tglenn on 2/10/18.
 */

open class RegexValidationHandler(
    val regex: Pattern,
    override var errorMessage: String,
    callback: ValidationHandled<CharSequence, EditText>? = null
                                 ) : EditTextValidationHandler(callback) {

    override fun isValid(value: CharSequence): Boolean = regex.matcher(value).matches()
}
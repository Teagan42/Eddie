package rocks.teagantotally.eddie.ui.validation

import android.text.TextUtils
import android.widget.EditText
import rocks.teagantotally.eddie.utils.extensions.toUri
import timber.log.Timber

/**
 * Created by tglenn on 2/10/18.
 */
class UriValidationhandler(
    override var errorMessage: String,
    callback: ValidationHandled<CharSequence, EditText>? = null
                          ) : EditTextValidationHandler(callback) {

    override fun isValid(value: CharSequence): Boolean {
        return try {
            value.toString().toUri()
                ?.let {
                    !TextUtils.isEmpty(it.scheme) && !TextUtils.isEmpty(it.host)
                } ?: false
        } catch (e: Exception) {
            Timber.d(
                e,
                "Unable to parse $value"
                    )
            false
        }
    }
}
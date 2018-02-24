package rocks.teagantotally.eddie.utils.extensions

import android.support.design.widget.TextInputLayout
import android.view.View
import android.widget.EditText

/**
 * Created by tglenn on 2/10/18.
 */

fun EditText.getInputLayout(): TextInputLayout? {
    var parentView = parent

    while (parentView is View) {
        if (parentView is TextInputLayout) {
            return parentView
        }

        parentView = parent.parent
    }

    return null
}
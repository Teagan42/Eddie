package rocks.teagantotally.eddie.ui.validation

import android.view.View

/**
 * Created by tglenn on 2/13/18.
 */
interface ValidationHandled<InputType, ViewTpe : View> {
    fun onValidationHandled(
        value: InputType,
        view: ViewTpe,
        valid: Boolean
                           )
}
package rocks.teagantotally.eddie.ui.annotations

import android.support.annotation.StringRes

/**
 * Created by tglenn on 2/10/18.
 */

@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS)
annotation class ActionBar(
    @StringRes val titleResourceId: Int = 0,
    val titleString: String = ""
                          )
package rocks.teagantotally.eddie.ui.annotations

import android.support.annotation.LayoutRes

/**
 * Created by tglenn on 2/9/18.
 */

@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS)
annotation class Layout(@LayoutRes val value: Int = 0)
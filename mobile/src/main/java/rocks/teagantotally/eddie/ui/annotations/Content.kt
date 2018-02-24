package rocks.teagantotally.eddie.ui.annotations

import android.support.annotation.IdRes
import rocks.teagantotally.eddie.R
import kotlin.reflect.KClass

/**
 * Created by tglenn on 2/10/18.
 */

@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS)
annotation class Content(
    val value: KClass<*>,
    @IdRes val containerViewId: Int = R.id.main_container
                        )

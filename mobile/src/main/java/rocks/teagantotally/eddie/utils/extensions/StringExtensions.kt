package rocks.teagantotally.eddie.utils.extensions

import android.net.Uri
import timber.log.Timber

/**
 * Created by tglenn on 2/16/18.
 */

fun String.toUri(): Uri? = try {
    Timber.d("Parsing $this as Uri")
    Uri.parse(this)
} catch (e: Exception) {
    null
}
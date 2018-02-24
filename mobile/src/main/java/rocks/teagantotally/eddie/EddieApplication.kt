package rocks.teagantotally.eddie

import android.support.multidex.MultiDexApplication
import rocks.teagantotally.eddie.di.Injector

/**
 * Created by tglenn on 12/23/17.
 */

class EddieApplication : MultiDexApplication() {
    init {
        Injector.initialize(this)
    }
}

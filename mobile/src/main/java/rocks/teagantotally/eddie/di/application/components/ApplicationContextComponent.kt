package rocks.teagantotally.eddie.di.application.components

import android.content.Context
import dagger.Component
import rocks.teagantotally.eddie.EddieApplication
import rocks.teagantotally.eddie.di.application.modules.ApplicationContextModule
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Singleton
@Component(modules = arrayOf(ApplicationContextModule::class))
interface ApplicationContextComponent {
    val application: EddieApplication

    val context: Context
}

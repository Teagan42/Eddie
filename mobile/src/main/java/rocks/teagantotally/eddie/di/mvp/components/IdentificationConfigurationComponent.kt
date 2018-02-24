package rocks.teagantotally.eddie.di.mvp.components

import dagger.Subcomponent
import rocks.teagantotally.eddie.di.mvp.modules.IdentificationConfigurationModule
import rocks.teagantotally.eddie.di.scopes.ViewScope
import rocks.teagantotally.eddie.ui.disconnected.configuration.ConfigurationContract
import rocks.teagantotally.eddie.ui.disconnected.configuration.IdentificationConfigurationFragment

/**
 * Created by tglenn on 2/16/18.
 */

@ViewScope
@Subcomponent(modules = arrayOf(IdentificationConfigurationModule::class))
interface IdentificationConfigurationComponent {
    fun identificationView(): ConfigurationContract.IdentificationView

    fun hostView(): ConfigurationContract.HostView?

    fun presenter(): ConfigurationContract.Presenter

    fun inject(fragment: IdentificationConfigurationFragment)
}

package rocks.teagantotally.eddie.di.mvp.components

import dagger.Subcomponent
import rocks.teagantotally.eddie.di.mvp.modules.HostConfigurationModule
import rocks.teagantotally.eddie.di.scopes.ViewScope
import rocks.teagantotally.eddie.ui.disconnected.configuration.ConfigurationContract
import rocks.teagantotally.eddie.ui.disconnected.configuration.HostConfigurationFragment

/**
 * Created by tglenn on 2/16/18.
 */

@ViewScope
@Subcomponent(modules = arrayOf(HostConfigurationModule::class))
interface HostConfigurationComponent {
    fun hostView(): ConfigurationContract.HostView

    fun identificationView(): ConfigurationContract.IdentificationView?

    fun presenter(): ConfigurationContract.Presenter

    fun inject(fragment: HostConfigurationFragment)
}

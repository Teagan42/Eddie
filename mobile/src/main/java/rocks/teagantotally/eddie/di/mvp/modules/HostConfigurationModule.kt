package rocks.teagantotally.eddie.di.mvp.modules

import dagger.Module
import dagger.Provides
import rocks.teagantotally.eddie.di.scopes.ViewScope
import rocks.teagantotally.eddie.providers.ConfigurationProvider
import rocks.teagantotally.eddie.ui.disconnected.configuration.ConfigurationContract
import rocks.teagantotally.eddie.ui.disconnected.configuration.ConfigurationPresenter

/**
 * Created by tglenn on 2/16/18.
 */

@Module
class HostConfigurationModule(private val view: ConfigurationContract.HostView) {
    @Provides
    @ViewScope
    fun hostView(): ConfigurationContract.HostView = view

    @Provides
    @ViewScope
    fun identificationView(): ConfigurationContract.IdentificationView? = null

    @Provides
    @ViewScope
    fun presenter(configurationProvider: ConfigurationProvider): ConfigurationContract.Presenter =
        ConfigurationPresenter(configurationProvider, view, null)
}

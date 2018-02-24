package rocks.teagantotally.eddie.di.mvp.components

import dagger.Subcomponent
import rocks.teagantotally.eddie.di.mvp.modules.ConnectModule
import rocks.teagantotally.eddie.di.scopes.ViewScope
import rocks.teagantotally.eddie.ui.disconnected.connect.ConnectActivity
import rocks.teagantotally.eddie.ui.disconnected.connect.ConnectContract

/**
 * Created by tglenn on 2/22/18.
 */
@ViewScope
@Subcomponent(modules = arrayOf(ConnectModule::class))
interface ConnectComponent {
    fun view(): ConnectContract.View

    fun presenter(): ConnectContract.Presenter

    fun inject(activity: ConnectActivity)
}
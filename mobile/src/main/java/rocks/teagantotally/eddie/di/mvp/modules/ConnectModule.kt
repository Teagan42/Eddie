package rocks.teagantotally.eddie.di.mvp.modules

import android.content.Context
import dagger.Module
import dagger.Provides
import org.greenrobot.eventbus.EventBus
import rocks.teagantotally.eddie.di.scopes.ViewScope
import rocks.teagantotally.eddie.ui.disconnected.connect.ConnectContract
import rocks.teagantotally.eddie.ui.disconnected.connect.ConnectPresenter

/**
 * Created by tglenn on 2/22/18.
 */
@Module
class ConnectModule(
    private val view: ConnectContract.View
                   ) {
    @Provides
    @ViewScope
    fun view(): ConnectContract.View = view

    @Provides
    @ViewScope
    fun presenter(context: Context,
                  eventBus: EventBus): ConnectContract.Presenter =
        ConnectPresenter(context, view, eventBus)
}
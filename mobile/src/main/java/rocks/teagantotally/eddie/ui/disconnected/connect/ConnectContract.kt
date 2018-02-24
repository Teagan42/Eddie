package rocks.teagantotally.eddie.ui.disconnected.connect

import rocks.teagantotally.eddie.di.mvp.MVPContract

/**
 * Created by tglenn on 2/22/18.
 */

interface ConnectContract {
    interface Presenter : MVPContract.Presenter {
        fun connect()
    }

    interface View : MVPContract.View {
        fun showConnecting()

        fun showConnected()

        fun showError()
    }
}
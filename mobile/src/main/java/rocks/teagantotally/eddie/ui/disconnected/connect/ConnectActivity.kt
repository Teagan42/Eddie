package rocks.teagantotally.eddie.ui.disconnected.connect

import android.widget.Toast
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.di.mvp.modules.ConnectModule
import rocks.teagantotally.eddie.ui.annotations.Layout
import rocks.teagantotally.eddie.ui.disconnected.DisconnectedActivity
import javax.inject.Inject

/**
 * Created by tglenn on 2/22/18.
 */
@Layout(R.layout.activity_container)
class ConnectActivity : DisconnectedActivity(), ConnectContract.View {

    override var disconnectOnResume: Boolean
        get() = false
        set(value) {}

    @Inject
    lateinit var presenter: ConnectPresenter

    override fun onStart() {
        super.onStart()
        presenter.connect()
    }

    override fun showConnecting() {
        setFragment(ConnectingFragment())
    }

    override fun showConnected() {
        Toast.makeText(
            this,
            "CONNECTED",
            Toast.LENGTH_LONG
                      ).show()
    }

    override fun showError() {
        setFragment(ConnectionErrorFragment.create("NO IDEA"))
    }

    override fun injectDependencies() {
        Injector.get()
            ?.components()
            ?.setConnect(ConnectModule(this))
            ?.inject(this)
    }
}
package rocks.teagantotally.eddie.ui.disconnected.connect

import android.content.Context
import android.content.Intent
import org.greenrobot.eventbus.EventBus
import org.greenrobot.eventbus.Subscribe
import org.greenrobot.eventbus.ThreadMode
import rocks.teagantotally.eddie.events.connection.Connect
import rocks.teagantotally.eddie.events.connection.Connected
import rocks.teagantotally.eddie.events.connection.Disconnect
import rocks.teagantotally.eddie.services.MqttService
import javax.inject.Inject

/**
 * Created by tglenn on 2/22/18.
 */
class ConnectPresenter
@Inject constructor(
    private val context: Context,
    private val view: ConnectContract.View,
    private val eventBus: EventBus
                   ) : ConnectContract.Presenter {
    override fun connect() =
        register()
            .also { view.showConnecting() }
            .also { Intent(context, MqttService::class.java).apply {
                action = MqttService.ACTION_MQTT_CONNECT
                context.startService(this)
            } }

    private fun register() = eventBus.register(this)

    private fun unregister() = eventBus.unregister(this)

    @Subscribe(threadMode = ThreadMode.MAIN)
    fun onConnection(event: Connected) = view.showConnecting().also { unregister() }

    @Subscribe(threadMode = ThreadMode.MAIN)
    fun onLoggedOut(event: Disconnect) = view.showError().also { unregister() }
}
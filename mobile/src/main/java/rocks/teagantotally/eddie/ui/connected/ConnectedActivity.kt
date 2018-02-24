package rocks.teagantotally.eddie.ui.connected

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import org.greenrobot.eventbus.EventBus
import org.greenrobot.eventbus.Subscribe
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.events.connection.Disconnect
import rocks.teagantotally.eddie.events.mqtt.MqttClientConnected
import rocks.teagantotally.eddie.events.mqtt.MqttClientDisconnected
import rocks.teagantotally.eddie.ui.BaseActivity
import rocks.teagantotally.eddie.ui.annotations.ActionBar
import rocks.teagantotally.eddie.ui.annotations.Layout
import timber.log.Timber
import javax.inject.Inject

/**
 * Created by tglenn on 12/23/17.
 */

@ActionBar(R.string.app_name)
@Layout(R.layout.activity_container)
class ConnectedActivity : BaseActivity() {

    @Inject
    lateinit var eventBus: EventBus

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Injector.get()?.components()?.inject(this)
    }

    @SuppressWarnings("unusesd")
    @Subscribe
    fun onLoggedOut(data: Disconnect) {
        Timber.i("User has been logged out")
        val intent = Intent(
            this,
            ConnectedActivity::class.java
                           )
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
        finish()
    }

    @SuppressWarnings("unused")
    @Subscribe
    fun onMqttConnected(data: MqttClientConnected) {
        Toast.makeText(
            this,
            "Connected",
            Toast.LENGTH_SHORT
                      ).show()
    }

    @SuppressWarnings("unused")
    @Subscribe
    fun onMqttDisconnected(data: MqttClientDisconnected) {
        Toast.makeText(
            this,
            "Disconnected",
            Toast.LENGTH_SHORT
                      ).show()
        if (data.isReconnecting) {
            return
        }

        eventBus.post(Disconnect())
    }
}

package rocks.teagantotally.eddie.ui.disconnected

import android.content.Intent
import android.os.Bundle
import android.os.PersistableBundle
import org.greenrobot.eventbus.EventBus
import org.greenrobot.eventbus.Subscribe
import org.greenrobot.eventbus.ThreadMode
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.events.connection.Connected
import rocks.teagantotally.eddie.services.MqttService
import rocks.teagantotally.eddie.ui.BaseActivity
import rocks.teagantotally.eddie.ui.connected.ConnectedActivity
import rocks.teagantotally.eddie.utils.extensions.ifTrue
import javax.inject.Inject

/**
 * Created by tglenn on 12/23/17.
 */

abstract class DisconnectedActivity : BaseActivity() {

    open protected var disconnectOnResume = true

    @Inject
    lateinit var eventBus: EventBus

    override fun injectDependencies() {
        Injector.get()
            ?.components()
            ?.inject(this)
        eventBus.register(this)
    }

    /**
     * Dispatch onResume() to fragments.  Note that for better inter-operation
     * with older versions of the platform, at the point of this call the
     * fragments attached to the activity are *not* resumed.  This means
     * that in some cases the previous state may still be saved, not allowing
     * fragment transactions that modify the state.  To correctly interact
     * with fragments in their proper state, you should instead override
     * [.onResumeFragments].
     */
    override fun onResume() {
        disconnectOnResume.ifTrue {
            Intent(this, MqttService::class.java).apply {
                action = MqttService.ACTION_MQTT_DISCONNECT
                startService(this)
            }
        }
        super.onResume()
    }

    @SuppressWarnings("unused")
    @Subscribe(threadMode = ThreadMode.ASYNC)
    fun onAuthenticated(data: Connected) {
        val intent = Intent(
            this,
            ConnectedActivity::class.java
                           )
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        startActivity(intent)
        finish()
    }
}

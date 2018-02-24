package rocks.teagantotally.eddie.di.application.modules

import dagger.Module
import dagger.Provides
import net.sf.xenqtt.client.MqttClientListener
import org.greenrobot.eventbus.EventBus
import rocks.teagantotally.eddie.data.mqtt.AsynchronousMqttListener
import rocks.teagantotally.eddie.data.mqtt.SynchronousMqttListener
import rocks.teagantotally.eddie.di.qualifiers.Async
import rocks.teagantotally.eddie.di.qualifiers.Sync
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Module
class MqttListenerModule {
    @Provides
    @Singleton
    @Async
    fun mqttAsynchronousClientListener(eventBus: EventBus): MqttClientListener {
        return AsynchronousMqttListener(eventBus)
    }

    @Provides
    @Singleton
    @Sync
    fun mqttSynchronousClientListener(eventBus: EventBus): MqttClientListener {
        return SynchronousMqttListener(eventBus)
    }
}

package rocks.teagantotally.eddie.di.application.components

import android.content.SharedPreferences
import dagger.Component
import net.sf.xenqtt.client.MqttClientListener
import org.greenrobot.eventbus.EventBus
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.di.application.modules.*
import rocks.teagantotally.eddie.di.data.components.MqttClientComponent
import rocks.teagantotally.eddie.di.data.modules.MqttClientModule
import rocks.teagantotally.eddie.di.qualifiers.Async
import rocks.teagantotally.eddie.di.qualifiers.Sync
import rocks.teagantotally.eddie.providers.ConfigurationProvider
import rocks.teagantotally.eddie.services.MqttService
import rocks.teagantotally.eddie.ui.connected.ConnectedActivity
import rocks.teagantotally.eddie.ui.disconnected.DisconnectedActivity
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Singleton
@Component(
    modules = arrayOf(
        ApplicationContextModule::class,
        MVPModule::class,
        PreferencesModule::class,
        ProviderModule::class,
        EventBusModule::class,
        MqttListenerModule::class
                     )
          )
interface ApplicationComponent : MVPComponent {
    //region Subcomponents

    fun setMqtt(module: MqttClientModule): MqttClientComponent

    //endregion

    //region Provides

    fun preferences(): SharedPreferences

    fun configurationProvider(): ConfigurationProvider

    fun eventBus(): EventBus

    @Async
    fun mqttAsynchronousClientListener(): MqttClientListener

    @Sync
    fun mqttSynchronousClientListener(): MqttClientListener

    //endregion

    //region Injections

    fun inject(service: MqttService)

    fun inject(activity: ConnectedActivity)

    fun inject(activity: DisconnectedActivity)

    fun inject(injector: Injector)

    //endregion
}

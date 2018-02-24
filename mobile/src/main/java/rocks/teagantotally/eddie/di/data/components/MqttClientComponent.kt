package rocks.teagantotally.eddie.di.data.components

import dagger.Subcomponent
import net.sf.xenqtt.client.MqttClient
import net.sf.xenqtt.client.MqttClientConfig
import rocks.teagantotally.eddie.di.data.modules.MqttClientModule
import rocks.teagantotally.eddie.di.qualifiers.Async
import rocks.teagantotally.eddie.di.qualifiers.BrokerUri
import rocks.teagantotally.eddie.di.qualifiers.Sync
import rocks.teagantotally.eddie.di.scopes.ServiceScope
import java.util.concurrent.Executor

/**
 * Created by tglenn on 12/23/17.
 */

@ServiceScope
@Subcomponent(modules = arrayOf(MqttClientModule::class))
interface MqttClientComponent {
    @BrokerUri
    fun brokerUri(): String

    fun config(): MqttClientConfig

    fun executor(): Executor

    @Sync
    fun synchronousClient(): MqttClient

    @Async
    fun asynchronousClient(): MqttClient
}

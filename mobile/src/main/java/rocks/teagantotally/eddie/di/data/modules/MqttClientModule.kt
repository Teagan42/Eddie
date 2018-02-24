package rocks.teagantotally.eddie.di.data.modules

import dagger.Module
import dagger.Provides
import net.sf.xenqtt.client.*
import rocks.teagantotally.eddie.di.qualifiers.Async
import rocks.teagantotally.eddie.di.qualifiers.BrokerUri
import rocks.teagantotally.eddie.di.qualifiers.Sync
import rocks.teagantotally.eddie.di.scopes.ServiceScope
import java.util.concurrent.Executor

/**
 * Created by tglenn on 12/23/17.
 */

@Module
class MqttClientModule(
    private val brokerUri: String,
    private val config: MqttClientConfig,
    private val executor: Executor
                      ) {

    @Provides
    @ServiceScope
    @BrokerUri
    fun brokerUri(): String {
        return brokerUri
    }

    @Provides
    @ServiceScope
    fun config(): MqttClientConfig {
        return config
    }


    @Provides
    @ServiceScope
    fun executor(): Executor {
        return executor
    }

    @Provides
    @ServiceScope
    @Sync
    fun synchronousClient(
        @BrokerUri brokerUri: String,
        @Sync listener: MqttClientListener,
        executor: Executor,
        config: MqttClientConfig
                         ): MqttClient {
        return SyncMqttClient(
            brokerUri,
            listener,
            executor,
            config
                             )
    }

    @Provides
    @ServiceScope
    @Async
    fun asynchronousClient(
        @BrokerUri brokerUri: String,
        @Async listener: MqttClientListener,
        executor: Executor,
        config: MqttClientConfig
                          ): MqttClient {
        return AsyncMqttClient(
            brokerUri,
            listener as AsyncClientListener,
            executor,
            config
                              )
    }
}

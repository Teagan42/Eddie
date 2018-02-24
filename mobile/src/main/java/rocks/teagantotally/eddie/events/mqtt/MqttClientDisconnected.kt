package rocks.teagantotally.eddie.events.mqtt

import net.sf.xenqtt.client.MqttClient
import java.util.*

/**
 * Created by tglenn on 12/23/17.
 */

class MqttClientDisconnected(
    val client: MqttClient,
    val cause: Throwable,
    val isReconnecting: Boolean
                            ) {

    init {
        Objects.requireNonNull(
            client,
            "Disconnected client cannot be null"
                              )
    }
}

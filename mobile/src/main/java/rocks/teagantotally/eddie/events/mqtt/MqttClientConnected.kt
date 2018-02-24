package rocks.teagantotally.eddie.events.mqtt

import net.sf.xenqtt.client.MqttClient
import net.sf.xenqtt.message.ConnectReturnCode
import java.util.*

/**
 * Created by tglenn on 12/23/17.
 */

class MqttClientConnected(
    val client: MqttClient,
    val code: ConnectReturnCode
                         ) {

    init {
        Objects.requireNonNull(
            client,
            "Connected client cannot be null"
                              )
        Objects.requireNonNull(
            code,
            "Connection code cannot be null"
                              )
    }
}

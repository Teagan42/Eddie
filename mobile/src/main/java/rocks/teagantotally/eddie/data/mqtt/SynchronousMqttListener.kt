package rocks.teagantotally.eddie.data.mqtt

import net.sf.xenqtt.client.MqttClient
import net.sf.xenqtt.client.MqttClientListener
import net.sf.xenqtt.client.PublishMessage
import net.sf.xenqtt.message.QoS
import org.greenrobot.eventbus.EventBus
import rocks.teagantotally.eddie.events.mqtt.MqttClientDisconnected
import rocks.teagantotally.eddie.events.mqtt.MqttMessageReceived
import javax.inject.Inject

/**
 * Created by tglenn on 12/23/17.
 */

class SynchronousMqttListener
@Inject constructor(var eventBus: EventBus) : MqttClientListener {

    /**
     * Called when a published message is received from the broker. You should always call [ack()][PublishMessage.ack] when you are done processing the
     * message. This is not required if the [QoS][PublishMessage.getQoS] is [QoS.AT_MOST_ONCE] but it is a good practice to always call it.
     *
     * @param client  The client that received the message
     * @param message
     */
    override fun publishReceived(
        client: MqttClient,
        message: PublishMessage
                                ) {
        message.ack()
        eventBus.post(
            MqttMessageReceived(
                message.topic,
                message.qoS,
                message.payload,
                message.isRetain
                               )
                     )
    }

    /**
     * Called when the connection to the broker is lost either unintentionally or because the client requested the disconnect.
     *
     * @param client       The client that was disconnected
     * @param cause        The exception that caused the client to disconnect. Null if there was no exception.
     * @param reconnecting True if the client will attempt to reconnect. False if either all reconnect attempts have failed or the disconnect was not because of an
     */
    override fun disconnected(
        client: MqttClient,
        cause: Throwable,
        reconnecting: Boolean
                             ) {
        eventBus.post(
            MqttClientDisconnected(
                client,
                cause,
                reconnecting
                                  )
                     )
    }
}

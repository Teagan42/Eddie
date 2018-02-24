package rocks.teagantotally.eddie.data.mqtt

import net.sf.xenqtt.client.AsyncClientListener
import net.sf.xenqtt.client.MqttClient
import net.sf.xenqtt.client.PublishMessage
import net.sf.xenqtt.client.Subscription
import net.sf.xenqtt.message.ConnectReturnCode
import net.sf.xenqtt.message.QoS
import org.greenrobot.eventbus.EventBus
import rocks.teagantotally.eddie.events.mqtt.MqttClientConnected
import rocks.teagantotally.eddie.events.mqtt.MqttClientDisconnected
import rocks.teagantotally.eddie.events.mqtt.MqttMessageReceived
import javax.inject.Inject

/**
 * Created by tglenn on 12/23/17.
 */

class AsynchronousMqttListener
@Inject constructor(var eventBus: EventBus) : AsyncClientListener {

    /**
     * Called after the client has received a connect acknowledgment from the broker.
     *
     * @param client     The client that is connected
     * @param returnCode The connect return code from the broker. Anything other than [ConnectReturnCode.ACCEPTED] will result in the client being immediately
     */
    override fun connected(
        client: MqttClient,
        returnCode: ConnectReturnCode
                          ) {
        eventBus.post(
            MqttClientConnected(
                client,
                returnCode
                               )
                     )
    }

    /**
     * Called when the client receives a subscribe acknowledgment from the broker.
     *
     * @param client                 The client that requested the subscriptions
     * @param requestedSubscriptions The subscriptions requested. The topics will be the same as those in grantedSubscriptions and the [QoS][Subscription.getQos] will be
     * the QoS the client requested.
     * @param grantedSubscriptions   The subscriptions. The topics will be the same as in requestedSubscriptions but the [QoS][Subscription.getQos] will be the QoS granted
     * by the broker, not the QoS requested by the client.
     * @param requestsGranted        True if the requested [QoS] for each topic matches the granted QoS. False otherwise.
     */
    override fun subscribed(
        client: MqttClient,
        requestedSubscriptions: Array<Subscription>,
        grantedSubscriptions: Array<Subscription>,
        requestsGranted: Boolean
                           ) {

    }

    /**
     * Called when an unsubscribe acknowledgment is received from the broker.
     *
     * @param client The client that requested the unsubscribe
     * @param topics
     */
    override fun unsubscribed(
        client: MqttClient,
        topics: Array<String>
                             ) {

    }

    /**
     * Called when the protocol to send a client publish message to the broker is complete.
     *
     * @param client  The client the message was published to
     * @param message The message that was published. This will be the same object passed to [MqttClient.publish].
     */
    override fun published(
        client: MqttClient,
        message: PublishMessage
                          ) {

    }

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

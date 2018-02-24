package rocks.teagantotally.eddie.events.mqtt

import net.sf.xenqtt.client.PublishMessage
import net.sf.xenqtt.message.QoS

/**
 * Created by tglenn on 12/23/17.
 */

class MqttMessageReceived : PublishMessage {
    /**
     * Creates a binary message.
     *
     * @param topicName The name of the topic to publish to. This may not contain wildcards ('+' and '#')
     * @param qos       The level of assurance for delivery.
     * @param payload   The payload as a byte array. It is valid to publish a zero length payload.
     * @param retain    If the Retain flag is set (1), the broker should hold on to the message after it has been delivered to the current subscribers. This is useful
     * where publishers send messages on a "report by exception" basis, where it might be some time between messages. This allows new subscribers to
     * instantly receive data with the retained, or Last Known Good, value. A broker may delete a retained message if it receives a message with a
     */
    constructor(
        topicName: String,
        qos: QoS,
        payload: ByteArray,
        retain: Boolean
               ) : super(
        topicName,
        qos,
        payload,
        retain
                        )

    /**
     * Creates a binary message with retain set to false. Delegates to [.publish].
     *
     * @param topicName
     * @param qos
     * @param payload
     * @see PublishMessage.PublishMessage
     */
    constructor(
        topicName: String,
        qos: QoS,
        payload: ByteArray
               ) : super(
        topicName,
        qos,
        payload
                        )

    /**
     * Creates a message with a string as the payload with retain set to false. The string is converted to a byte[] using UTF8 encoding and used as the binary
     * message payload. Delegates to [.PublishMessage].
     *
     * @param topicName
     * @param qos
     * @param payload
     * @see PublishMessage.PublishMessage
     */
    constructor(
        topicName: String,
        qos: QoS,
        payload: String
               ) : super(
        topicName,
        qos,
        payload
                        )

    /**
     * Creates a message with a string as the payload. The string is converted to a byte[] using UTF8 encoding and used as the binary message payload. Delegates
     * to [.PublishMessage].
     *
     * @param topicName
     * @param qos
     * @param payload
     * @param retain
     * @see PublishMessage.PublishMessage
     */
    constructor(
        topicName: String,
        qos: QoS,
        payload: String,
        retain: Boolean
               ) : super(
        topicName,
        qos,
        payload,
        retain
                        )
}

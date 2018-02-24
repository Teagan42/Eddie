package rocks.teagantotally.eddie.services

import android.app.IntentService
import android.content.Intent
import android.os.Bundle
import net.sf.xenqtt.client.MqttClient
import net.sf.xenqtt.client.MqttClientConfig
import net.sf.xenqtt.client.Subscription
import net.sf.xenqtt.message.ConnectReturnCode
import net.sf.xenqtt.message.QoS
import org.greenrobot.eventbus.EventBus
import org.greenrobot.eventbus.Subscribe
import org.greenrobot.eventbus.ThreadMode
import rocks.teagantotally.eddie.di.Injector
import rocks.teagantotally.eddie.di.data.modules.MqttClientModule
import rocks.teagantotally.eddie.events.connection.Connected
import rocks.teagantotally.eddie.events.connection.Disconnect
import rocks.teagantotally.eddie.events.mqtt.MqttMessageReceived
import rocks.teagantotally.eddie.providers.ConfigurationProvider
import rocks.teagantotally.eddie.utils.extensions.ifFalse
import rocks.teagantotally.eddie.utils.extensions.ifTrue
import timber.log.Timber
import java.util.*
import java.util.concurrent.Executors
import javax.inject.Inject

/**
 * Created by tglenn on 12/23/17.
 */

class MqttService : IntentService(NAME) {

    @Inject
    lateinit var eventBus: EventBus
    @Inject
    lateinit var configurationProvider: ConfigurationProvider

    private var client: MqttClient? = null

    init {
        Injector.get()
            ?.components()
            ?.inject(this)

        eventBus.register(this)
    }

    override fun onHandleIntent(intent: Intent?) {
        if (intent == null) {
            return
        }

        when (intent.action) {
            ACTION_MQTT_CONNECT     -> handleConnectIntent(intent.extras)
            ACTION_MQTT_DISCONNECT  -> handleDisconnectIntent(intent.extras)
            ACTION_MQTT_SUBSCRIBE   -> handleSubscribe(intent.extras)
            ACTION_MQTT_UNSUBSCRIBE -> handleUnsubscribe(intent.extras)
            else                    -> Timber.tag(TAG).w("Unknown action ${intent.action}")
        }
    }

    override fun onDestroy() {
        client?.ifFalse(client?.isClosed, {
            client?.disconnect()
        })

        super.onDestroy()
    }

    fun handleConnectIntent(arguments: Bundle?) {
        val shouldReconnect = arguments?.getBoolean(
            RECONNECT,
            false
                                                   ) ?: false

        client?.ifFalse(client?.isClosed,
                        {
                            shouldReconnect.ifFalse {
                                client?.disconnect()
                            }
                        })

        client =
                configurationProvider.getConnectionConfiguration().let {
                    Injector.get()
                        ?.setMqttClient(
                            MqttClientModule(
                                brokerUri = it.brokerUri.toString(),
                                config = MqttClientConfig()
                                    .setBlockingTimeoutSeconds(it.blockingTimeout!!)
                                    .setMessageResendIntervalSeconds(it.resendDelay!!)
                                    .setConnectTimeoutSeconds(it.connectionTimeout!!),
                                executor = Executors.newSingleThreadExecutor()
                                            )
                                       )
                        ?.synchronousClient()
                }?.let {
                        configurationProvider.getIdentificatonConfiguration().apply {
                            it.connect(deviceId, true)?.apply {
                                Timber.tag(TAG).d(name)
                                eventBus.post(
                                    if (this == ConnectReturnCode.ACCEPTED) Connected()
                                    else Disconnect())
                            }
                        }
                        it
                    }
    }

    fun handleDisconnectIntent(arguments: Bundle?) {
        client?.isClosed?.ifTrue {
            Timber.i("Client is already disconnected")
            return
        }

        client?.disconnect()
    }

    fun handleSubscribe(arguments: Bundle?) {
        if (arguments == null || !arguments.containsKey(TOPIC)) {
            throw IllegalArgumentException("Missing required argument $TOPIC")
        }

        val topicArg = arguments.get(TOPIC)
        val qosArg = arguments.getInt(
            QOS,
            QoS.AT_LEAST_ONCE.ordinal
                                     )
        val topics: Array<String> =
            if (topicArg!!.javaClass == String::class.java) {
                arrayOf(topicArg as String)
            } else {
                topicArg as Array<String>
            }

        val subscriptions = topics.mapTo(ArrayList()) {
            Subscription(
                it,
                QoS.lookup(qosArg)
                        )
        }

        client?.subscribe(subscriptions)
    }

    fun handleUnsubscribe(arguments: Bundle?) {
        if (arguments == null || !arguments.containsKey(TOPIC)) {
            throw IllegalArgumentException("Missing required argument $TOPIC")
        }

        val topicArg = arguments.get(TOPIC)
        val topics: Array<String>

        topics = if (topicArg!!.javaClass == String::class.java) {
            arrayOf(topicArg as String)
        } else {
            topicArg as Array<String>
        }

        client?.unsubscribe(topics)
    }

    @SuppressWarnings("unused")
    @Subscribe(threadMode = ThreadMode.ASYNC)
    fun onMessageReceived(message: MqttMessageReceived) {

    }

    companion object {
        const val TOPIC = "TOPIC"
        const val QOS = "QOS"
        const val RECONNECT = "RECONNECT"

        private const val TAG = "MqttService"
        private val NAME = MqttService::class.java.name
        val ACTION_MQTT_CONNECT = NAME + ".connect"
        val ACTION_MQTT_DISCONNECT = NAME + ".disconnect"
        val ACTION_MQTT_SUBSCRIBE = NAME + ".subscribe"
        val ACTION_MQTT_UNSUBSCRIBE = NAME + ".unsubscribe"
    }
}

package rocks.teagantotally.eddie.di

import rocks.teagantotally.eddie.EddieApplication
import rocks.teagantotally.eddie.di.application.components.ApplicationComponent
import rocks.teagantotally.eddie.di.application.components.DaggerApplicationComponent
import rocks.teagantotally.eddie.di.application.modules.ApplicationContextModule
import rocks.teagantotally.eddie.di.data.components.MqttClientComponent
import rocks.teagantotally.eddie.di.data.modules.MqttClientModule
import rocks.teagantotally.eddie.di.mvp.components.HostConfigurationComponent
import rocks.teagantotally.eddie.di.mvp.modules.HostConfigurationModule

/**
 * Created by tglenn on 12/23/17.
 */

class Injector(private var applicationComponent: ApplicationComponent) {

    companion object {
        private const val TAG = "Injector"
        private var injector: Injector? = null

        fun get() = injector

        /**
         * Initialize with a custom build dagger component builder
         *
         * @param application Application instance
         * @param builder     Component builder
         */
        fun initialize(
            application: EddieApplication,
            builder: DaggerApplicationComponent.Builder
                      ): Injector =
            ApplicationContextModule(application).let {
                builder.applicationContextModule(it)
                    .build().let {
                    Injector(it)
                }.also { injector = it }
            }

        /**
         * Initialize the injector
         *
         * @param application Application instance
         */
        fun initialize(application: EddieApplication): Injector =
            when (injector?.applicationComponent) {
                null -> initialize(application, DaggerApplicationComponent.builder())
                else ->
                    throw IllegalStateException("The injector has already been initialized")
            }
    }

    fun components(): ApplicationComponent? = injector?.applicationComponent

    fun setMqttClient(module: MqttClientModule): MqttClientComponent? =
        injector?.applicationComponent?.setMqtt(module)
}

package rocks.teagantotally.eddie.di.application.components

import rocks.teagantotally.eddie.di.mvp.components.ConnectComponent
import rocks.teagantotally.eddie.di.mvp.components.HostConfigurationComponent
import rocks.teagantotally.eddie.di.mvp.components.IdentificationConfigurationComponent
import rocks.teagantotally.eddie.di.mvp.modules.ConnectModule
import rocks.teagantotally.eddie.di.mvp.modules.HostConfigurationModule
import rocks.teagantotally.eddie.di.mvp.modules.IdentificationConfigurationModule

/**
 * Created by tglenn on 2/17/18.
 */
interface MVPComponent {
    fun setHostConfiguration(module: HostConfigurationModule):
            HostConfigurationComponent

    fun setIdentificationConfiguration(module: IdentificationConfigurationModule):
            IdentificationConfigurationComponent

    fun setConnect(module: ConnectModule):
            ConnectComponent
}
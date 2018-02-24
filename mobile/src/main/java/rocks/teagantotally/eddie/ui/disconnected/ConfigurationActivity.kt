package rocks.teagantotally.eddie.ui.disconnected

import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.ui.annotations.Content
import rocks.teagantotally.eddie.ui.annotations.Layout
import rocks.teagantotally.eddie.ui.disconnected.configuration.HostConfigurationFragment

/**
 * Created by tglenn on 2/9/18.
 */

@Layout(R.layout.activity_container)
@Content(HostConfigurationFragment::class)
class ConfigurationActivity : DisconnectedActivity() {

}
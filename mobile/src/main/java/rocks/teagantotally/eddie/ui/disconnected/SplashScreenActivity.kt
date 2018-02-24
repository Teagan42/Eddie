package rocks.teagantotally.eddie.ui.disconnected

import android.content.Intent
import android.os.Bundle
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.ui.annotations.Layout

/**
 * Created by tglenn on 2/9/18.
 */

@Layout(R.layout.activity_splash_screen)
class SplashScreenActivity : DisconnectedActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, ConfigurationActivity::class.java))
    }
}
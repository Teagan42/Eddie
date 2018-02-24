package rocks.teagantotally.eddie.di.application.modules

import android.content.Context
import dagger.Module
import dagger.Provides
import rocks.teagantotally.eddie.EddieApplication
import java.util.*
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Module
class ApplicationContextModule(
    @get:Provides
    @get:Singleton
    val application: EddieApplication
                              ) {

    val context: Context
        @Provides
        @Singleton
        get() = application.applicationContext

    init {
        Objects.requireNonNull(
            application,
            "Application cannot be null"
                              )
    }
}

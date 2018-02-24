package rocks.teagantotally.eddie.di.application.modules

import android.content.Context
import android.content.SharedPreferences
import dagger.Module
import dagger.Provides
import rocks.teagantotally.eddie.providers.ConfigurationProvider
import javax.inject.Singleton

/**
 * Created by tglenn on 2/15/18.
 */
@Module
class ProviderModule {
    @Provides
    @Singleton
    fun configurationProvider(
        context: Context,
        sharedPreferences: SharedPreferences
                             ): ConfigurationProvider =
        ConfigurationProvider(context, sharedPreferences)
}
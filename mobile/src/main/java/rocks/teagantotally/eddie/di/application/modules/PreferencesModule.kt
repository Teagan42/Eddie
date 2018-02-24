package rocks.teagantotally.eddie.di.application.modules

import android.content.Context
import android.content.SharedPreferences
import android.preference.PreferenceManager
import dagger.Module
import dagger.Provides
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Module
class PreferencesModule {
    @Provides
    @Singleton
    fun preferences(context: Context): SharedPreferences {
        return PreferenceManager.getDefaultSharedPreferences(context)
    }
}

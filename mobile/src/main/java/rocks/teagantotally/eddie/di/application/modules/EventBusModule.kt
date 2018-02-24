package rocks.teagantotally.eddie.di.application.modules

import dagger.Module
import dagger.Provides
import org.greenrobot.eventbus.EventBus
import javax.inject.Singleton

/**
 * Created by tglenn on 12/23/17.
 */

@Module
class EventBusModule {
    @Provides
    @Singleton
    fun eventBus(): EventBus {
        return EventBus.getDefault()
    }
}

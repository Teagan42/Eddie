package rocks.teagantotally.eddie.ui.adapters.bindings

import android.support.annotation.LayoutRes
import android.view.View

/**
 * Created by tglenn on 2/10/18.
 */
abstract class ConditionalItemBinder<ItemType, ViewType : View>(@LayoutRes layoutResourceId: Int) :
    ItemBinder<ItemType, ViewType>(layoutResourceId) {

    abstract fun canBind(item: ItemType): Boolean
}
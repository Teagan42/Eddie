package rocks.teagantotally.eddie.ui.adapters.bindings

import android.support.annotation.LayoutRes
import android.view.View

/**
 * Created by tglenn on 2/10/18.
 */
abstract class ItemBinder<ItemType, ViewType : View> {

    constructor(layoutResourceId: Int) {
        this.layoutResourceId = layoutResourceId
    }

    @LayoutRes
    var layoutResourceId: Int = 0

    abstract fun bind(
        item: ItemType,
        view: ViewType
                     )

    constructor()
}
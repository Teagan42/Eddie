package rocks.teagantotally.eddie.ui.adapters.bindings

import android.view.View

/**
 * Created by tglenn on 2/10/18.
 */
class CompositeItemBinder<ItemType, ViewType : View>() : ItemBinder<ItemType, ViewType>() {

    constructor(vararg binders: ConditionalItemBinder<ItemType, ViewType>) : this() {
        this.binders = binders
    }

    lateinit var binders: Array<out ConditionalItemBinder<ItemType, ViewType>>

    override fun bind(
        item: ItemType,
        view: ViewType
                     ) {
        binders.firstOrNull { it.canBind(item) }?.bind(
            item,
            view
                                                      )
                ?: throw IllegalStateException("Unable to determine binder for item ${item.toString()}")
    }
}
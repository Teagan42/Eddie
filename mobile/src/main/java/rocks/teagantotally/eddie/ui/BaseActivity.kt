package rocks.teagantotally.eddie.ui

import android.os.Bundle
import android.os.PersistableBundle
import android.support.annotation.CallSuper
import android.support.annotation.IdRes
import android.support.annotation.LayoutRes
import android.support.v4.app.Fragment
import android.support.v7.app.AppCompatActivity
import android.text.TextUtils
import kotlinx.android.synthetic.main.activity_container.*
import rocks.teagantotally.eddie.R
import rocks.teagantotally.eddie.ui.annotations.ActionBar
import rocks.teagantotally.eddie.ui.annotations.Content
import rocks.teagantotally.eddie.ui.annotations.Layout
import rocks.teagantotally.eddie.utils.extensions.ifTrue
import rocks.teagantotally.eddie.utils.extensions.inTransaction
import kotlin.reflect.KClass

/**
 * Created by tglenn on 12/23/17.
 */

abstract class BaseActivity : AppCompatActivity() {

    @LayoutRes
    protected open var layoutResourceId: Int = 0
    protected open var defaultContentClass: KClass<Fragment>? = null
    @IdRes
    protected open var contentViewId: Int = R.id.main_container
    protected open var titleString: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        initialize()
    }

    override fun onCreate(
        savedInstanceState: Bundle?,
        persistentState: PersistableBundle?
                         ) {
        super.onCreate(
            savedInstanceState,
            persistentState
                      )
        initialize()
    }

    private fun initialize() {
        processAnnotations()

        setContentView(layoutResourceId)

        setSupportActionBar(main_toolbar)

        title = titleString

        defaultContentClass?.apply {
            val fragment = defaultContentClass
                ?.constructors
                ?.first { it.parameters.isEmpty() }
                ?.call() as? BaseFragment
            fragment?.also { setFragment(it) }
        }

        injectDependencies()
    }

    private fun processAnnotations() {
        javaClass.annotations?.map { process(it) }
    }

    @CallSuper
    protected fun process(annotation: Annotation) {
        when (annotation) {
            is Layout    -> layoutResourceId = annotation.value
            is Content   -> {
                defaultContentClass = annotation.value as? KClass<Fragment>
                contentViewId = annotation.containerViewId
            }
            is ActionBar -> {
                titleString = when {
                    annotation.titleResourceId > 0             -> getString(annotation.titleResourceId)
                    !TextUtils.isEmpty(annotation.titleString) -> annotation.titleString
                    else                                       -> null
                }
            }
        }
    }

    override fun setTitle(title: CharSequence?) {
        supportActionBar?.title = title
    }

    fun setFragment(
        fragment: BaseFragment,
        addToBackStack: Boolean = false
                   ) {
        supportFragmentManager.inTransaction {
            replace(
                contentViewId,
                fragment,
                fragment::class.simpleName
                   )
            addToBackStack.ifTrue { addToBackStack(fragment::class.simpleName) }
        }
    }

    open fun injectDependencies() {}
}

package rocks.teagantotally.eddie.ui

import android.os.Bundle
import android.support.annotation.CallSuper
import android.support.annotation.LayoutRes
import android.support.v4.app.Fragment
import android.text.TextUtils
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import rocks.teagantotally.eddie.ui.annotations.ActionBar
import rocks.teagantotally.eddie.ui.annotations.Layout

/**
 * Created by tglenn on 2/9/18.
 */
abstract class BaseFragment : Fragment() {

    @LayoutRes
    protected open var layoutResourceId: Int = 0
    protected open var title: String? = null

    lateinit var rootView: View

    /**
     * Called to have the fragment instantiate its user interface view.
     * This is optional, and non-graphical fragments can return null (which
     * is the default implementation).  This will be called between
     * [.onCreate] and [.onActivityCreated].
     *
     *
     * If you return a View from here, you will later be called in
     * [.onDestroyView] when the view is being released.
     *
     * @param inflater The LayoutInflater object that can be used to inflate
     * any views in the fragment,
     * @param container If non-null, this is the parent view that the fragment's
     * UI should be attached to.  The fragment should not add the view itself,
     * but this can be used to generate the LayoutParams of the view.
     * @param savedInstanceState If non-null, this fragment is being re-constructed
     * from a previous saved state as given here.
     *
     * @return Return the View for the fragment's UI, or null.
     */
    override fun onCreateView(
        inflater: LayoutInflater?,
        container: ViewGroup?,
        savedInstanceState: Bundle?
                             ): View? {
        return initialize(
            inflater!!,
            container
                         )

    }

    /**
     * Called when the Fragment is visible to the user.  This is generally
     * tied to [Activity.onStart] of the containing
     * Activity's lifecycle.
     */
    override fun onStart() {
        super.onStart()
        title?.let { activity?.title = it }
    }

    protected open fun initialize() {

    }

    private fun initialize(
        inflater: LayoutInflater,
        container: ViewGroup?
                          ): View? {
        processAnnotations()

        inflater.inflate(
            layoutResourceId,
            container,
            false
                        )
            .let { rootView = it }

        injectDependencies()

        initialize()

        return rootView
    }

    private fun processAnnotations() {
        javaClass.annotations.map {
            process(it)
        }
    }

    @CallSuper
    protected fun process(annotation: Annotation) {
        when (annotation) {
            is Layout    -> layoutResourceId = annotation.value
            is ActionBar -> title = when {
                annotation.titleResourceId > 0             -> getString(annotation.titleResourceId)
                !TextUtils.isEmpty(annotation.titleString) -> annotation.titleString
                else                                       -> null
            }
        }
    }

    open fun injectDependencies() {}
}
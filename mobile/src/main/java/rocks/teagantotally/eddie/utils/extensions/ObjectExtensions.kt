package rocks.teagantotally.eddie.utils.extensions

/**
 * Created by tglenn on 2/9/18.
 */

//if predicate is true, execute block, no return
inline fun <T> T.ifTrue(predicate: (T) -> Boolean?, block: (T) -> Unit) =
    predicate(this)?.ifTrue {
        block(this)
    }

//if expression is true, execute block, no return
inline fun <T> T.ifTrue(expression: Boolean?, block: (T) -> Unit) =
    expression?.ifTrue {
        block(this)
    }

//if predicate is true, execute block, no return
inline fun <T> T.ifFalse(predicate: (T) -> Boolean?, block: (T) -> Unit) =
    predicate(this)?.ifFalse {
        block(this)
    }

//if expression is true, execute block, no return
inline fun <T> T.ifFalse(expression: Boolean?, block: (T) -> Unit) =
    expression?.ifFalse {
        block(this)
    }

//if predicate is true, execute block and return a value, else return null
inline fun <T, R> T.ifMaybe(predicate: (T) -> Boolean?, block: (T) -> R): R? =
    predicate(this)?.ifTrueMaybe {
        block(this)
    }

//if expression is true, execute block and return a value, else return null
inline fun <T, R> T.ifMaybe(expression: Boolean?, block: (T) -> R): R? =
    expression?.ifTrueMaybe {
        block(this)
    }

//if predicate is true, execute block, always return receiver
inline fun <T> T.ifAlso(predicate: (T) -> Boolean?, block: (T) -> Unit): T =
    predicate(this)?.ifTrueMaybe {
        this.also {
            block(it)
        }
    } ?: this

//if expression is true, execute block, always return receiver
inline fun <T> T.ifAlso(expression: Boolean?, block: (T) -> Unit): T =
    expression?.ifTrueMaybe {
        this.also {
            block(it)
        }
    } ?: this

//if predicate is true, execute block, always return receiver, facilitate "apply" idioms
inline fun <T> T.ifApply(predicate: (T) -> Boolean?, block: T.() -> Unit): T =
    predicate(this)?.ifTrueMaybe {
        this.also {
            block()
        }
    } ?: this

//if expression is true, execute block, always return receiver, facilitate "apply" idioms
inline fun <T> T.ifApply(expression: Boolean?, block: T.() -> Unit): T =
    expression?.ifTrueMaybe {
        this.also {
            block()
        }
    } ?: this

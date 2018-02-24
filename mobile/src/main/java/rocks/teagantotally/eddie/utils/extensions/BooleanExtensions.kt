package rocks.teagantotally.eddie.utils.extensions

/**
 * Created by tglenn on 2/9/18.
 */

//if true execute block
inline fun Boolean.ifTrue(block: () -> Unit): Unit = if (this) block() else Unit

//if true execute block and nullable value
inline fun <R> Boolean.ifTrueMaybe(block: () -> R): R? = if (this) block() else null

//if true execute block, return receiver
inline fun Boolean.ifTrueAlso(block: () -> Unit): Boolean =
    this.ifTrueMaybe { this.also { block() } } ?: this

//if false execute block
inline fun Boolean.ifFalse(block: () -> Unit): Unit = if (!this) block() else Unit

//if false, execute block return value, else return null
inline fun <R> Boolean.ifFalseMaybe(block: () -> R): R? = if (!this) block() else null

//if false execute block, return receiver, else return receiver without executing block
inline fun Boolean.ifFalseAlso(block: () -> Unit): Boolean =
    this.ifFalseMaybe { this.also { block() } } ?: this
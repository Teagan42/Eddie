package rocks.teagantotally.eddie.di.scopes;

import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

import javax.inject.Scope;

/**
 * Created by tglenn on 12/23/17.
 */

@Scope
@Retention(RetentionPolicy.RUNTIME)
public @interface ViewScope {
}

package ru.dovakun.services;

import com.vaadin.flow.server.auth.AnonymousAllowed;
import com.vaadin.hilla.BrowserCallable;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import ru.dovakun.data.User;
import ru.dovakun.security.AuthenticatedUser;

@BrowserCallable
@AnonymousAllowed
public class UserEndpoint {

    @Autowired
    private AuthenticatedUser authenticatedUser;

    public Optional<User> getAuthenticatedUser() {
        return authenticatedUser.get();
    }
}

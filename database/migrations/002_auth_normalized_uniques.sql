CREATE UNIQUE INDEX users_username_lower_unique_idx ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_unique_idx ON users (lower(email));
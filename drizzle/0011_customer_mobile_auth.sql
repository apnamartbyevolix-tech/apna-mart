CREATE TABLE customer_phone_identities (
 phone varchar(16) NOT NULL PRIMARY KEY,
 user_id int NOT NULL UNIQUE,
 verified_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
--> statement-breakpoint
CREATE TABLE customer_otp_challenges (
 id varchar(36) NOT NULL PRIMARY KEY,
 phone varchar(16) NOT NULL,
 digest char(64) NOT NULL,
 browser_hash char(64) NOT NULL,
 state varchar(12) NOT NULL,
 attempts int NOT NULL DEFAULT 0,
 expires_at datetime NOT NULL,
 created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX otp_phone_created(phone,created_at)
);
--> statement-breakpoint
CREATE TABLE customer_auth_limits (
 bucket char(64) NOT NULL PRIMARY KEY,
 hits int NOT NULL,
 resets_at datetime NOT NULL,
 last_at datetime NOT NULL
);
--> statement-breakpoint
CREATE TABLE customer_mobile_sessions (
 token_hash char(64) NOT NULL PRIMARY KEY,
 user_id int NOT NULL,
 expires_at datetime NOT NULL,
 last_seen_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 revoked_at datetime NULL,
 created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX mobile_session_user(user_id),
 FOREIGN KEY(user_id) REFERENCES users(id)
);

<?php
// WordPress configuration for WP-CLI database operations
// This allows WP-CLI to work without requiring an active WordPress site

// Database settings - these will be overridden by command line flags
define('DB_NAME', 'wordpress');
define('DB_USER', 'admin');
define('DB_PASSWORD', 'temp-password');
define('DB_HOST', 'eb-env-wordpress-dev-proxy.proxy-cu6wbca0x7hw.us-east-1.rds.amazonaws.com');
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');

$table_prefix = 'wp_';

// Security keys (required by WordPress)
define('AUTH_KEY',         'test-key');
define('SECURE_AUTH_KEY',  'test-key');
define('LOGGED_IN_KEY',    'test-key');
define('NONCE_KEY',        'test-key');
define('AUTH_SALT',        'test-key');
define('SECURE_AUTH_SALT', 'test-key');
define('LOGGED_IN_SALT',   'test-key');
define('NONCE_SALT',       'test-key');

// WordPress settings
define('WP_DEBUG', false);
define('ABSPATH', __DIR__ . '/');

// Load WordPress
require_once ABSPATH . 'wp-settings.php';
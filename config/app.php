<?php

return [

    'name' => env('APP_NAME', 'SATMAT EV'),

    'env' => env('APP_ENV', 'production'),

    'debug' => (bool) env('APP_DEBUG', false),

    'url' => env('APP_URL', 'https://evcharger.satmatgroup.com'),

    'timezone' => 'Asia/Kolkata',

    'locale' => 'en',

    'fallback_locale' => 'en',

    'faker_locale' => 'en_US',

    'cipher' => 'AES-256-CBC',

    'key' => env('APP_KEY', 'base64:wXp69Lq1P8wG4Xf0bZ5lY9gM2V3eR7tK8uI0oP1aQ2w='),

    'previous_keys' => [
        ...array_filter(
            explode(',', env('APP_PREVIOUS_KEYS', ''))
        ),
    ],

];

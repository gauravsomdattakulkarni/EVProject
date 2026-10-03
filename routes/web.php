<?php

use Illuminate\Support\Facades\Route;

// Requirement 17: in / home page simple <p> tag with text satmat ev
Route::get('/', function () {
    return response('<p>satmat ev</p>', 200)->header('Content-Type', 'text/html');
});

Route::get('/login_admin', function () {
    // Serves the compiled SPA or admin entry
    if (file_exists(public_path('index.html'))) {
        return file_get_contents(public_path('index.html'));
    }
    return response('<p>SATMAT EV Admin Portal</p>', 200)->header('Content-Type', 'text/html');
});

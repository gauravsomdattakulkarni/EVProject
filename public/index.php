<?php

define('LARAVEL_START', microtime(true));

// Determine project base directory dynamically
$baseDir = file_exists(__DIR__ . '/bootstrap/app.php') ? __DIR__ : dirname(__DIR__);

// Normalize requested URI
$rawUri = $_SERVER['REQUEST_URI'] ?? '/';
$uri = parse_url($rawUri, PHP_URL_PATH) ?: '/';

// -------------------------------------------------------------------------
// Requirement 17: In / home page simple <p> tag with text "satmat ev"
// -------------------------------------------------------------------------
if ($uri === '/' || $uri === '' || $uri === '/index.php') {
    header('Content-Type: text/html; charset=UTF-8');
    echo '<p>satmat ev</p>';
    exit;
}

// -------------------------------------------------------------------------
// Check if PM2 / Node.js daemon is active on port 3000
// -------------------------------------------------------------------------
$nodePort = 3000;
$nodeActive = false;
$fp = @fsockopen('127.0.0.1', $nodePort, $errno, $errstr, 0.2);
if ($fp) {
    fclose($fp);
    $nodeActive = true;
}

// -------------------------------------------------------------------------
// Proxy API, OCPI, and Admin requests to Node/PM2 if active
// -------------------------------------------------------------------------
if ($nodeActive && function_exists('curl_init')) {
    $url = 'http://127.0.0.1:' . $nodePort . $rawUri;
    $ch = curl_init($url);

    $headers = [];
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $key => $value) {
            if (!in_array(strtolower($key), ['host', 'content-length', 'transfer-encoding'])) {
                $headers[] = "$key: $value";
            }
        }
    }

    $headers[] = 'Host: ' . ($_SERVER['HTTP_HOST'] ?? 'evcharger.satmatgroup.com');
    $headers[] = 'X-Forwarded-For: ' . ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    $headers[] = 'X-Forwarded-Proto: ' . ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http');

    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

    if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'PATCH', 'DELETE'])) {
        $body = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $response = curl_exec($ch);

    if ($response !== false) {
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        http_response_code($httpCode);
        $headerStr = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);

        $headerLines = explode("\r\n", $headerStr);
        foreach ($headerLines as $line) {
            if ($line && !stripos($line, 'Transfer-Encoding:') && !stripos($line, 'HTTP/')) {
                header($line, false);
            }
        }
        echo $body;
        exit;
    }

    curl_close($ch);
}

// -------------------------------------------------------------------------
// If PM2 is not active, boot Laravel 11 Application Bootstrap
// -------------------------------------------------------------------------
if (file_exists($baseDir . '/vendor/autoload.php') && file_exists($baseDir . '/bootstrap/app.php')) {
    require $baseDir . '/vendor/autoload.php';
    /** @var \Illuminate\Foundation\Application $app */
    $app = require_once $baseDir . '/bootstrap/app.php';
    $app->handleRequest(\Illuminate\Http\Request::capture());
    exit;
}

// -------------------------------------------------------------------------
// Fallback for Admin Portal if Laravel/PM2 are warming up
// -------------------------------------------------------------------------
if ($uri === '/login_admin') {
    $adminHtml = $baseDir . '/dist/index.html';
    if (file_exists($adminHtml)) {
        header('Content-Type: text/html; charset=UTF-8');
        readfile($adminHtml);
        exit;
    }
}

// Default 404
http_response_code(404);
header('Content-Type: text/html; charset=UTF-8');
echo '<p>404 Not Found</p>';

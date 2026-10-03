<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Models\Charger;
use App\Models\OcpiPartner;
use App\Models\Tariff;

/*
|--------------------------------------------------------------------------
| SATMAT EV API & OCPI Routes
|--------------------------------------------------------------------------
*/

Route::get('/health', function () {
    return response()->json([
        'status' => 'ONLINE',
        'project' => 'SATMAT EV',
        'domain' => 'https://evcharger.satmatgroup.com/',
        'timestamp' => now()->toIso8601String()
    ]);
});

// Admin Chargers CRUD
Route::prefix('chargers')->group(function () {
    Route::get('/', function () {
        return response()->json(Charger::with('connectors')->get());
    });

    Route::post('/', function (Request $request) {
        $validated = $request->validate([
            'id' => 'required|string|unique:chargers,id',
            'name' => 'required|string',
            'base_cost_per_kwh' => 'nullable|numeric',
        ]);
        $domain = env('APP_URL', 'https://evcharger.satmatgroup.com');
        $cleanDomain = preg_replace('/^https?:\/\//', '', $domain);
        $wsUrl = "wss://{$cleanDomain}/ocpp/{$request->id}";

        $charger = Charger::create(array_merge($request->all(), [
            'ws_url' => $wsUrl,
            'local_ws_url' => "ws://localhost:3000/ocpp/{$request->id}"
        ]));

        return response()->json($charger, 201);
    });

    Route::get('/{id}', function ($id) {
        return response()->json(Charger::with('connectors')->findOrFail($id));
    });

    Route::put('/{id}', function (Request $request, $id) {
        $charger = Charger::findOrFail($id);
        $charger->update($request->all());
        return response()->json($charger);
    });

    Route::delete('/{id}', function ($id) {
        $charger = Charger::findOrFail($id);
        $charger->delete();
        return response()->json(['success' => true]);
    });
});

// OCPI Roaming Partners
Route::prefix('ocpi/partners')->group(function () {
    Route::get('/', function () {
        return response()->json(OcpiPartner::all());
    });

    Route::post('/', function (Request $request) {
        $partner = OcpiPartner::create($request->all());
        return response()->json($partner, 201);
    });

    Route::put('/{id}', function (Request $request, $id) {
        $partner = OcpiPartner::findOrFail($id);
        $partner->update($request->all());
        return response()->json($partner);
    });

    Route::delete('/{id}', function ($id) {
        $partner = OcpiPartner::findOrFail($id);
        $partner->delete();
        return response()->json(['success' => true]);
    });
});

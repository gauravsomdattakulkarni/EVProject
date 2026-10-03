<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Charger extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'ws_url',
        'local_ws_url',
        'address',
        'city',
        'postal_code',
        'country',
        'latitude',
        'longitude',
        'status',
        'is_connected',
        'last_heartbeat',
        'ocpp_version',
        'base_cost_per_kwh',
        'idle_fee_per_minute',
        'session_base_fee',
        'max_power_kw',
        'charge_point_vendor',
        'charge_point_model',
        'firmware_version'
    ];

    protected $casts = [
        'is_connected' => 'boolean',
        'last_heartbeat' => 'datetime',
        'base_cost_per_kwh' => 'float',
        'idle_fee_per_minute' => 'float',
        'session_base_fee' => 'float',
        'max_power_kw' => 'float',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public function connectors()
    {
        return $this->hasMany(Connector::class, 'charger_id', 'id');
    }

    public function sessions()
    {
        return $this->hasMany(ChargingSession::class, 'machine_id', 'id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ChargingSession extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'transaction_id',
        'machine_id',
        'connector_id',
        'id_tag',
        'start_time',
        'end_time',
        'energy_kwh',
        'cost',
        'status',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'energy_kwh' => 'float',
        'cost' => 'float',
        'transaction_id' => 'integer',
        'connector_id' => 'integer',
    ];

    public function charger()
    {
        return $this->belongsTo(Charger::class, 'machine_id', 'id');
    }
}

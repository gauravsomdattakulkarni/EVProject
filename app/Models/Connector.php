<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Connector extends Model
{
    use HasFactory;

    protected $fillable = [
        'charger_id',
        'connector_number',
        'name',
        'type',
        'power_type',
        'max_kw',
        'voltage',
        'amperage',
        'status'
    ];

    protected $casts = [
        'max_kw' => 'float',
        'voltage' => 'integer',
        'amperage' => 'integer',
        'connector_number' => 'integer',
    ];

    public function charger()
    {
        return $this->belongsTo(Charger::class, 'charger_id', 'id');
    }
}

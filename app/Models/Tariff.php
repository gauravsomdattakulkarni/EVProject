<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Tariff extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'currency',
        'price_per_kwh',
        'price_per_minute',
        'idle_fee_per_minute',
        'session_fee',
        'tax_percentage',
    ];

    protected $casts = [
        'price_per_kwh' => 'float',
        'price_per_minute' => 'float',
        'idle_fee_per_minute' => 'float',
        'session_fee' => 'float',
        'tax_percentage' => 'float',
    ];
}

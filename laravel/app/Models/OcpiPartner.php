<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OcpiPartner extends Model
{
    use HasFactory;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'party_id',
        'country_code',
        'role',
        'token_a',
        'token_b',
        'partner_token',
        'url',
        'ocpi_version',
        'status',
        'pricing_type',
        'custom_cost_per_kwh',
        'price_adjustment_percent',
        'notes',
        'last_access_at'
    ];

    protected $casts = [
        'custom_cost_per_kwh' => 'float',
        'price_adjustment_percent' => 'float',
        'last_access_at' => 'datetime'
    ];
}

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('ocpi_partners', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('name', 191);
            $table->string('party_id', 10);
            $table->string('country_code', 5)->default('IN');
            $table->enum('role', ['CPO', 'eMSP', 'HUB'])->default('eMSP');
            $table->string('token_a', 128);
            $table->string('token_b', 128);
            $table->string('partner_token', 128)->nullable();
            $table->string('url', 255);
            $table->string('ocpi_version', 10)->default('2.0');
            $table->enum('status', ['ACTIVE', 'PENDING', 'SUSPENDED'])->default('ACTIVE');
            $table->enum('pricing_type', ['DEFAULT', 'CUSTOM_RATE', 'PERCENTAGE_DISCOUNT', 'PERCENTAGE_MARKUP'])->default('DEFAULT');
            $table->decimal('custom_cost_per_kwh', 8, 2)->nullable();
            $table->decimal('price_adjustment_percent', 5, 2)->default(0.00);
            $table->text('notes')->nullable();
            $table->timestamp('last_access_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ocpi_partners');
    }
};

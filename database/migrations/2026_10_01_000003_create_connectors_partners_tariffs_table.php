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
        if (!Schema::hasTable('connectors')) {
            Schema::create('connectors', function (Blueprint $table) {
                $table->id();
                $table->string('charger_id', 64);
                $table->integer('connector_number')->default(1);
                $table->string('name', 100);
                $table->enum('type', ['CCS2', 'Type2', 'CHAdeMO', 'GB_T', 'Bharat_DC001', 'Bharat_AC001'])->default('CCS2');
                $table->enum('power_type', ['DC', 'AC_3_PHASE', 'AC_1_PHASE'])->default('DC');
                $table->decimal('max_kw', 8, 2)->default(60.00);
                $table->integer('voltage')->default(400);
                $table->integer('amperage')->default(150);
                $table->enum('status', ['Available', 'Occupied', 'Charging', 'Faulted', 'Unavailable', 'Reserved'])->default('Available');
                $table->timestamps();

                $table->foreign('charger_id')->references('id')->on('chargers')->onDelete('cascade');
            });
        }

        if (!Schema::hasTable('ocpi_partners')) {
            Schema::create('ocpi_partners', function (Blueprint $table) {
                $table->string('id', 64)->primary();
                $table->string('name', 191);
                $table->string('party_id', 10);
                $table->string('country_code', 5)->default('IN');
                $table->enum('role', ['CPO', 'eMSP', 'HUB'])->default('eMSP');
                $table->string('token_a', 128);
                $table->string('token_b', 128);
                $table->string('partner_token', 128)->nullable();
                $table->string('url', 255)->default('');
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

        if (!Schema::hasTable('tariffs')) {
            Schema::create('tariffs', function (Blueprint $table) {
                $table->string('id', 64)->primary();
                $table->string('name', 191);
                $table->string('currency', 10)->default('INR');
                $table->decimal('price_per_kwh', 8, 2)->default(16.00);
                $table->decimal('price_per_minute', 8, 2)->default(0.00);
                $table->decimal('idle_fee_per_minute', 8, 2)->default(1.00);
                $table->decimal('session_fee', 8, 2)->default(10.00);
                $table->decimal('tax_percentage', 5, 2)->default(18.00);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('charging_sessions')) {
            Schema::create('charging_sessions', function (Blueprint $table) {
                $table->string('id', 64)->primary();
                $table->integer('transaction_id');
                $table->string('machine_id', 64);
                $table->integer('connector_id');
                $table->string('id_tag', 100);
                $table->timestamp('start_time');
                $table->timestamp('end_time')->nullable();
                $table->decimal('energy_kwh', 10, 2)->default(0.00);
                $table->decimal('cost', 10, 2)->default(0.00);
                $table->enum('status', ['Active', 'Completed', 'Stopped'])->default('Active');
                $table->timestamps();

                $table->foreign('machine_id')->references('id')->on('chargers')->onDelete('cascade');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('charging_sessions');
        Schema::dropIfExists('tariffs');
        Schema::dropIfExists('ocpi_partners');
        Schema::dropIfExists('connectors');
    }
};

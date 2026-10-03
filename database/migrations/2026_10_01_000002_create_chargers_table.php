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
        if (!Schema::hasTable('chargers')) {
            Schema::create('chargers', function (Blueprint $table) {
                $table->string('id', 64)->primary(); // Machine ID (e.g. SATMAT-EV-001)
                $table->string('name', 191);
                $table->string('ws_url', 255);
                $table->string('local_ws_url', 255)->nullable();
                $table->string('address', 255)->default('');
                $table->string('city', 100)->default('Pune');
                $table->string('postal_code', 20)->default('411001');
                $table->string('country', 10)->default('IND');
                $table->decimal('latitude', 10, 7)->default(18.5204);
                $table->decimal('longitude', 10, 7)->default(73.8567);
                $table->enum('status', ['Available', 'Occupied', 'Charging', 'Offline', 'Faulted'])->default('Offline');
                $table->boolean('is_connected')->default(false);
                $table->timestamp('last_heartbeat')->nullable();
                $table->string('ocpp_version', 20)->default('1.6J');
                $table->decimal('base_cost_per_kwh', 8, 2)->default(16.00);
                $table->decimal('idle_fee_per_minute', 8, 2)->default(1.00);
                $table->decimal('session_base_fee', 8, 2)->default(10.00);
                $table->decimal('max_power_kw', 8, 2)->default(60.00);
                $table->string('charge_point_vendor', 100)->default('SATMAT');
                $table->string('charge_point_model', 100)->default('SM-01');
                $table->string('firmware_version', 50)->default('v1.0.0');
                $table->timestamps();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('chargers');
    }
};

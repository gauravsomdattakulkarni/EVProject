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
        Schema::create('tariffs', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('name', 191);
            $table->string('currency', 10)->default('INR');
            $table->decimal('price_per_kwh', 8, 2)->default(16.50);
            $table->decimal('price_per_minute', 8, 2)->default(0.00);
            $table->decimal('idle_fee_per_minute', 8, 2)->default(1.50);
            $table->decimal('session_fee', 8, 2)->default(15.00);
            $table->decimal('tax_percentage', 5, 2)->default(18.00);
            $table->timestamps();
        });

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

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('charging_sessions');
        Schema::dropIfExists('tariffs');
    }
};

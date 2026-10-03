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

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('connectors');
    }
};

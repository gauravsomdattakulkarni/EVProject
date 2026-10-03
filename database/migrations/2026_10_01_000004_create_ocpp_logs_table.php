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
        if (!Schema::hasTable('ocpp_logs')) {
            Schema::create('ocpp_logs', function (Blueprint $table) {
                $table->id();
                $table->string('log_id', 128)->nullable()->index();
                $table->string('type', 20)->default('OCPP')->index();
                $table->string('protocol', 50)->default('OCPP 1.6J');
                $table->enum('direction', ['IN', 'OUT'])->index();
                $table->string('action', 100)->index();
                $table->string('machine_id', 64)->nullable()->index();
                $table->integer('connector_id')->nullable();
                $table->string('transaction_id', 64)->nullable()->index();
                $table->string('message_id', 128)->nullable()->index();
                $table->integer('message_type_id')->nullable();
                $table->string('status', 64)->nullable()->index();
                $table->integer('duration_ms')->nullable();
                $table->string('ip', 45)->nullable();
                $table->json('payload')->nullable();
                $table->longText('raw_message')->nullable();
                $table->json('details')->nullable();
                $table->timestamp('created_at')->useCurrent()->index();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('ocpp_logs');
    }
};

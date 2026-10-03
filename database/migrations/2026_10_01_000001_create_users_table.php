<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->unique();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->string('role')->default('SUPER_ADMIN');
                $table->rememberToken();
                $table->timestamps();
            });
        }

        // Auto-seed default admin credentials if not existing
        $adminExists = DB::table('users')->where('email', 'admin@satmatgroup.com')->exists();
        if (!$adminExists) {
            DB::table('users')->insert([
                'name' => 'SATMAT Admin',
                'email' => 'admin@satmatgroup.com',
                'password' => Hash::make('admin123'),
                'role' => 'SUPER_ADMIN',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

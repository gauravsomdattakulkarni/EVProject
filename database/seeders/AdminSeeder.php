<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AdminSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        DB::table('users')->updateOrInsert(
            ['email' => 'admin@satmatgroup.com'],
            [
                'name' => 'SATMAT Admin',
                'password' => Hash::make('admin123'),
                'role' => 'SUPER_ADMIN',
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }
}

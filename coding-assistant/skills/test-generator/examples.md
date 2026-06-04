# Test Generator Examples

## Example 1: Testing a Service Class

**User Request:**
```
/test-generator Create unit tests for DiscountCalculator service
```

**Output:**
```php
<?php

use App\Services\DiscountCalculator;
use App\Models\User;
use App\Models\Order;

describe('DiscountCalculator', function () {
    beforeEach(function () {
        $this->calculator = new DiscountCalculator();
    });

    describe('calculate()', function () {
        it('applies VIP discount correctly', function () {
            $user = User::factory()->vip()->make();
            $order = Order::factory()->make([
                'total' => 1000,
                'user_id' => $user->id,
            ]);

            $discount = $this->calculator->calculate($order);

            expect($discount)->toBe(250.0); // 25% of 1000
        });

        it('applies returning customer discount', function () {
            $user = User::factory()->returning()->make();
            $order = Order::factory()->make([
                'total' => 500,
                'user_id' => $user->id,
            ]);

            $discount = $this->calculator->calculate($order);

            expect($discount)->toBe(50.0); // 10% of 500
        });

        it('returns zero discount for new customers under threshold', function () {
            $user = User::factory()->make();
            $order = Order::factory()->make([
                'total' => 500,
                'user_id' => $user->id,
            ]);

            $discount = $this->calculator->calculate($order);

            expect($discount)->toBe(0.0);
        });

        it('handles different order amounts', function (float $amount, float $expected) {
            $user = User::factory()->vip()->make();
            $order = Order::factory()->make([
                'total' => $amount,
                'user_id' => $user->id,
            ]);

            $discount = $this->calculator->calculate($order);

            expect($discount)->toBe($expected);
        })->with([
            [100, 10.0],    // VIP 10% for <500
            [500, 75.0],    // VIP 15% for 500-1000
            [1000, 250.0],  // VIP 25% for >1000
            [1500, 375.0],  // VIP 25% for >1000
        ]);
    });

    describe('applyCoupon()', function () {
        it('applies valid percentage coupon', function () {
            $order = Order::factory()->make(['total' => 100]);
            $coupon = Coupon::factory()->make(['type' => 'percentage', 'value' => 20]);

            $discount = $this->calculator->applyCoupon($order, $coupon);

            expect($discount)->toBe(20.0);
        });

        it('applies valid fixed coupon', function () {
            $order = Order::factory()->make(['total' => 100]);
            $coupon = Coupon::factory()->make(['type' => 'fixed', 'value' => 15]);

            $discount = $this->calculator->applyCoupon($order, $coupon);

            expect($discount)->toBe(15.0);
        });

        it('throws exception for expired coupon', function () {
            $order = Order::factory()->make(['total' => 100]);
            $coupon = Coupon::factory()->expired()->make();

            expect(fn() => $this->calculator->applyCoupon($order, $coupon))
                ->toThrow(CouponExpiredException::class);
        });

        it('does not exceed order total', function () {
            $order = Order::factory()->make(['total' => 50]);
            $coupon = Coupon::factory()->make(['type' => 'fixed', 'value' => 100]);

            $discount = $this->calculator->applyCoupon($order, $coupon);

            expect($discount)->toBe(50.0); // Max discount is order total
        });
    });
});
```

## Example 2: Testing Authentication

**User Request:**
```
/test-generator Create tests for authentication endpoints
```

**Output:**
```php
<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

describe('Authentication', function () {
    describe('POST /api/auth/register', function () {
        it('registers a new user with valid data', function () {
            $userData = [
                'name' => 'John Doe',
                'email' => 'john@example.com',
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ];

            $response = $this->postJson('/api/auth/register', $userData);

            $response->assertStatus(201)
                ->assertJsonStructure([
                    'access_token',
                    'token_type',
                    'expires_in'
                ]);

            $this->assertDatabaseHas('users', [
                'name' => 'John Doe',
                'email' => 'john@example.com',
            ]);

            expect(User::where('email', 'john@example.com')->exists())->toBeTrue();
        });

        it('validates required fields', function (array $data, string $error) {
            $response = $this->postJson('/api/auth/register', $data);

            $response->assertStatus(422)
                ->assertJsonValidationErrors($error);
        })->with([
            'missing name' => [['email' => 'john@example.com', 'password' => 'password'], 'name'],
            'missing email' => [['name' => 'John', 'password' => 'password'], 'email'],
            'invalid email' => [['name' => 'John', 'email' => 'invalid', 'password' => 'password'], 'email'],
            'short password' => [['name' => 'John', 'email' => 'john@example.com', 'password' => 'pass'], 'password'],
            'password mismatch' => [[
                'name' => 'John',
                'email' => 'john@example.com',
                'password' => 'password',
                'password_confirmation' => 'different'
            ], 'password'],
        ]);

        it('prevents duplicate email registration', function () {
            $user = User::factory()->create(['email' => 'existing@example.com']);

            $response = $this->postJson('/api/auth/register', [
                'name' => 'Jane Doe',
                'email' => 'existing@example.com',
                'password' => 'password',
                'password_confirmation' => 'password',
            ]);

            $response->assertStatus(422)
                ->assertJsonValidationErrors('email');
        });

        it('hashes password before storing', function () {
            $this->postJson('/api/auth/register', [
                'name' => 'John Doe',
                'email' => 'john@example.com',
                'password' => 'Password123',
                'password_confirmation' => 'Password123',
            ]);

            $user = User::where('email', 'john@example.com')->first();

            expect(Hash::check('Password123', $user->password))->toBeTrue();
            expect($user->password)->not->toBe('Password123');
        });
    });

    describe('POST /api/auth/login', function () {
        beforeEach(function () {
            $this->user = User::factory()->create([
                'email' => 'john@example.com',
                'password' => Hash::make('password'),
            ]);
        });

        it('authenticates user with valid credentials', function () {
            $response = $this->postJson('/api/auth/login', [
                'email' => 'john@example.com',
                'password' => 'password',
            ]);

            $response->assertStatus(200)
                ->assertJsonStructure([
                    'access_token',
                    'token_type',
                    'expires_in'
                ]);

            expect($response->json('token_type'))->toBe('Bearer');
        });

        it('rejects invalid email', function () {
            $response = $this->postJson('/api/auth/login', [
                'email' => 'wrong@example.com',
                'password' => 'password',
            ]);

            $response->assertStatus(401)
                ->assertJson(['message' => 'Invalid credentials']);
        });

        it('rejects invalid password', function () {
            $response = $this->postJson('/api/auth/login', [
                'email' => 'john@example.com',
                'password' => 'wrongpassword',
            ]);

            $response->assertStatus(401);
        });
    });

    describe('POST /api/auth/logout', function () {
        it('logs out authenticated user', function () {
            $user = User::factory()->create();
            $token = $user->createToken('test-token')->plainTextToken;

            $response = $this->withHeader('Authorization', "Bearer {$token}")
                ->postJson('/api/auth/logout');

            $response->assertStatus(200);

            // Token should be deleted
            expect($user->tokens()->count())->toBe(0);
        });

        it('requires authentication', function () {
            $response = $this->postJson('/api/auth/logout');

            $response->assertStatus(401);
        });
    });

    describe('GET /api/auth/user', function () {
        it('returns authenticated user data', function () {
            $user = User::factory()->create([
                'name' => 'John Doe',
                'email' => 'john@example.com',
            ]);

            $response = $this->actingAs($user)
                ->getJson('/api/auth/user');

            $response->assertStatus(200)
                ->assertJson([
                    'id' => $user->id,
                    'name' => 'John Doe',
                    'email' => 'john@example.com',
                ]);
        });

        it('requires authentication', function () {
            $response = $this->getJson('/api/auth/user');

            $response->assertStatus(401);
        });
    });
});
```

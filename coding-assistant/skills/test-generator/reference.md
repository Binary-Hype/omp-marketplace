# Test Generator Reference

## Pest Syntax Patterns

### 1. Basic Test Structure

```php
// Simple test
it('calculates discount correctly', function () {
    $calculator = new DiscountCalculator();

    $result = $calculator->calculate(100, 0.1);

    expect($result)->toBe(90);
});

// Alternative with test()
test('user can register', function () {
    $response = $this->post('/register', [
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
    ]);

    $response->assertRedirect('/dashboard');
});
```

### 2. Datasets for Parameterized Tests

```php
it('validates email format', function (string $email, bool $isValid) {
    $validator = Validator::make(
        ['email' => $email],
        ['email' => 'required|email']
    );

    expect($validator->passes())->toBe($isValid);
})->with([
    ['user@example.com', true],
    ['invalid-email', false],
    ['@example.com', false],
    ['user@', false],
]);
```

### 3. Using beforeEach and afterEach

```php
describe('Shopping Cart', function () {
    beforeEach(function () {
        $this->user = User::factory()->create();
        $this->cart = Cart::factory()->for($this->user)->create();
    });

    afterEach(function () {
        Cache::flush();
    });

    it('adds items to cart', function () {
        $product = Product::factory()->create();

        $this->cart->addItem($product, quantity: 2);

        expect($this->cart->items)->toHaveCount(1);
        expect($this->cart->total)->toBe($product->price * 2);
    });
});
```

### 4. Custom Expectations

```php
it('returns valid user data', function () {
    $user = User::factory()->create([
        'name' => 'John Doe',
        'email' => 'john@example.com',
    ]);

    expect($user)
        ->toBeInstanceOf(User::class)
        ->name->toBe('John Doe')
        ->email->toBe('john@example.com')
        ->email_verified_at->toBeNull();
});
```

## Laravel-Specific Testing Patterns

### 1. Testing API Resources

```php
it('returns user resource with correct structure', function () {
    $user = User::factory()->create([
        'name' => 'John Doe',
        'email' => 'john@example.com',
    ]);

    $response = $this->actingAs($user)
        ->getJson("/api/users/{$user->id}");

    $response->assertStatus(200)
        ->assertJson([
            'data' => [
                'id' => $user->id,
                'name' => 'John Doe',
                'email' => 'john@example.com',
            ]
        ])
        ->assertJsonStructure([
            'data' => ['id', 'name', 'email', 'created_at']
        ]);
});
```

### 2. Testing Form Requests

```php
it('validates store user request', function (array $data, string $error) {
    $response = $this->actingAs(User::factory()->admin()->create())
        ->postJson('/api/users', $data);

    $response->assertStatus(422)
        ->assertJsonValidationErrors($error);
})->with([
    'missing name' => [['email' => 'john@example.com'], 'name'],
    'invalid email' => [['name' => 'John', 'email' => 'invalid'], 'email'],
    'duplicate email' => [fn() => [
        'name' => 'John',
        'email' => User::factory()->create()->email
    ], 'email'],
]);
```

### 3. Testing Jobs and Queues

```php
it('dispatches email job when user registers', function () {
    Queue::fake();

    $this->post('/register', [
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
    ]);

    Queue::assertPushed(SendWelcomeEmail::class, function ($job) {
        return $job->user->email === 'john@example.com';
    });
});

it('processes payment job successfully', function () {
    $payment = Payment::factory()->pending()->create();

    ProcessPayment::dispatch($payment);

    expect($payment->fresh()->status)->toBe('completed');
});
```

### 4. Testing Events and Listeners

```php
it('fires user registered event', function () {
    Event::fake([UserRegistered::class]);

    $user = User::factory()->create();

    Event::assertDispatched(UserRegistered::class, function ($event) use ($user) {
        return $event->user->id === $user->id;
    });
});
```

### 5. Testing Mail

```php
it('sends welcome email to new users', function () {
    Mail::fake();

    $user = User::factory()->create();

    Mail::assertSent(WelcomeEmail::class, function ($mail) use ($user) {
        return $mail->hasTo($user->email);
    });
});
```

### 6. Testing File Uploads

```php
it('uploads user avatar', function () {
    Storage::fake('public');

    $file = UploadedFile::fake()->image('avatar.jpg', 600, 600);

    $response = $this->actingAs(User::factory()->create())
        ->post('/profile/avatar', ['avatar' => $file]);

    $response->assertStatus(200);

    Storage::disk('public')->assertExists('avatars/' . $file->hashName());
});
```

### 7. Testing Database Transactions

```php
it('creates order with items in transaction', function () {
    $user = User::factory()->create();
    $products = Product::factory()->count(3)->create();

    $response = $this->actingAs($user)
        ->postJson('/api/orders', [
            'items' => $products->map(fn($p) => [
                'product_id' => $p->id,
                'quantity' => 2,
            ])->toArray()
        ]);

    $response->assertStatus(201);

    $this->assertDatabaseHas('orders', ['user_id' => $user->id]);
    $this->assertDatabaseCount('order_items', 3);
});
```

## Factory Generation

### Model Factory Example

```php
<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class PostFactory extends Factory
{
    public function definition(): array
    {
        return [
            'title' => fake()->sentence(),
            'slug' => fake()->slug(),
            'content' => fake()->paragraphs(3, true),
            'excerpt' => fake()->text(160),
            'status' => 'draft',
            'author_id' => User::factory(),
            'published_at' => null,
            'view_count' => fake()->numberBetween(0, 1000),
        ];
    }

    /**
     * Indicate that the post is published.
     */
    public function published(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'published',
            'published_at' => fake()->dateTimeBetween('-1 year', 'now'),
        ]);
    }

    /**
     * Indicate that the post is a draft.
     */
    public function draft(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'draft',
            'published_at' => null,
        ]);
    }

    /**
     * Indicate that the post is featured.
     */
    public function featured(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_featured' => true,
        ]);
    }
}
```

## Common Test Patterns

### Testing Policies
```php
it('allows users to update their own posts', function () {
    $user = User::factory()->create();
    $post = Post::factory()->for($user, 'author')->create();

    expect($user->can('update', $post))->toBeTrue();
});

it('prevents users from updating others posts', function () {
    $user = User::factory()->create();
    $post = Post::factory()->create();

    expect($user->can('update', $post))->toBeFalse();
});
```

### Testing Middleware
```php
it('redirects unauthenticated users', function () {
    $response = $this->get('/dashboard');

    $response->assertRedirect('/login');
});

it('allows authenticated users', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/dashboard');

    $response->assertStatus(200);
});
```

### Testing Scopes
```php
it('returns only active users', function () {
    User::factory()->count(3)->create(['status' => 'active']);
    User::factory()->count(2)->create(['status' => 'inactive']);

    $activeUsers = User::active()->get();

    expect($activeUsers)->toHaveCount(3);
});
```

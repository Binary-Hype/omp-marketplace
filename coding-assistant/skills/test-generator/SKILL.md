---
name: test-generator
description: Generates comprehensive Laravel tests using Pest syntax. Creates feature tests, unit tests, factories, and test data with proper assertions, mocking, and Laravel testing helpers.
---

# Test Generator (Laravel + Pest)

An intelligent skill that creates comprehensive test suites for your Laravel application using Pest PHP. Generates feature tests, unit tests, database factories, and realistic test data with proper assertions and Laravel testing conventions.

## When to Use This Skill

Use this skill when:
- You need to add tests to existing code
- You're practicing TDD (Test-Driven Development)
- You want comprehensive test coverage for a feature
- You need to generate database factories and seeders
- You're testing API endpoints and responses
- You want to test authentication and authorization
- You need integration tests for complex workflows
- You're adding tests before refactoring (safety net)
- You want to learn Pest testing patterns

## What This Skill Does

This skill provides comprehensive test generation by:

1. **Feature Test Generation**
   - HTTP request/response tests
   - API endpoint testing with JSON assertions
   - Authentication and authorization tests
   - Form validation testing
   - Database interaction tests
   - File upload/download tests
   - Email and notification tests

2. **Unit Test Generation**
   - Class method testing
   - Service and Action class tests
   - Model relationship tests
   - Helper function tests
   - Business logic validation
   - Edge case coverage

3. **Pest-Specific Features**
   - Uses Pest's expressive syntax
   - Proper dataset usage for parameterized tests
   - Custom expectations and matchers
   - Test organization with describe blocks
   - Proper use of `it()` and `test()` functions
   - beforeEach/afterEach hooks

4. **Laravel Testing Helpers**
   - `actingAs()` for authentication
   - `assertDatabaseHas()` / `assertDatabaseMissing()`
   - `assertJson()` / `assertJsonStructure()`
   - `assertStatus()` / `assertRedirect()`
   - `fake()` for mocking Mail, Queue, Events
   - `RefreshDatabase` trait usage

5. **Factory and Seeder Generation**
   - Model factories with realistic data
   - State definitions for different scenarios
   - Relationship factory setup
   - Database seeders for test data

## How to Use

Simply invoke the skill when you need tests:

```
/skill:test-generator
```

Or request specific tests:

```
/skill:test-generator Create tests for UserController
```

```
/skill:test-generator Generate factory and tests for Post model
```

```
I need feature tests for my authentication system
```

```
/skill:test-generator Write unit tests for DiscountCalculator service
```

## Test Generation Process

When this skill is invoked, it follows this systematic approach:

1. **Understand the Code**
   - Read the target file (controller, service, model)
   - Identify methods and their responsibilities
   - Analyze dependencies and relationships
   - Review validation rules and business logic
   - Use **code-review** subagent to understand code structure

2. **Determine Test Types**
   - Feature tests for HTTP endpoints
   - Unit tests for business logic
   - Integration tests for complex workflows
   - Database tests for model interactions

3. **Generate Test Structure**
   - Organize tests with Pest describe blocks
   - Create descriptive test names using `it()`
   - Set up necessary factories and test data
   - Mock external dependencies (Mail, API calls, etc.)

4. **Write Assertions**
   - Use appropriate Laravel test assertions
   - Verify database state changes
   - Check response structures and status codes
   - Validate business logic outcomes

5. **Cross-Reference with Documentation**
   - Review route definitions or API contracts in the codebase
   - Ensure tests match documented behavior

## Output Format

The skill provides complete test files ready to use:

```php
<?php

use App\Models\User;
use App\Models\Post;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

describe('Post Management', function () {
    beforeEach(function () {
        $this->user = User::factory()->create();
    });

    describe('GET /posts', function () {
        it('returns paginated posts', function () {
            Post::factory()->count(25)->create();

            $response = $this->actingAs($this->user)
                ->getJson('/api/posts');

            $response->assertStatus(200)
                ->assertJsonStructure([
                    'data' => [
                        '*' => ['id', 'title', 'content', 'author']
                    ],
                    'meta' => ['current_page', 'total', 'per_page'],
                    'links'
                ]);

            expect($response->json('data'))->toHaveCount(15);
        });

        it('filters posts by author', function () {
            $author = User::factory()->create();
            Post::factory()->count(5)->for($author, 'author')->create();
            Post::factory()->count(3)->create();

            $response = $this->actingAs($this->user)
                ->getJson("/api/posts?author={$author->id}");

            $response->assertStatus(200);
            expect($response->json('data'))->toHaveCount(5);
        });

        it('requires authentication', function () {
            $response = $this->getJson('/api/posts');

            $response->assertStatus(401);
        });
    });

    describe('POST /posts', function () {
        it('creates a post with valid data', function () {
            $postData = [
                'title' => 'Test Post',
                'content' => 'This is test content.',
                'status' => 'draft',
            ];

            $response = $this->actingAs($this->user)
                ->postJson('/api/posts', $postData);

            $response->assertStatus(201)
                ->assertJsonFragment([
                    'title' => 'Test Post',
                    'author_id' => $this->user->id,
                ]);

            $this->assertDatabaseHas('posts', [
                'title' => 'Test Post',
                'author_id' => $this->user->id,
            ]);
        });

        it('validates required fields', function (array $invalidData, string $errorField) {
            $response = $this->actingAs($this->user)
                ->postJson('/api/posts', $invalidData);

            $response->assertStatus(422)
                ->assertJsonValidationErrors($errorField);
        })->with([
            'missing title' => [['content' => 'Content'], 'title'],
            'missing content' => [['title' => 'Title'], 'content'],
            'invalid status' => [['title' => 'Title', 'content' => 'Content', 'status' => 'invalid'], 'status'],
        ]);

        it('sends notification to followers when published', function () {
            Notification::fake();

            $follower = User::factory()->create();
            $this->user->followers()->attach($follower);

            $response = $this->actingAs($this->user)
                ->postJson('/api/posts', [
                    'title' => 'Published Post',
                    'content' => 'Content',
                    'status' => 'published',
                ]);

            Notification::assertSentTo($follower, PostPublished::class);
        });
    });

    describe('PUT /posts/{post}', function () {
        it('allows author to update their post', function () {
            $post = Post::factory()->for($this->user, 'author')->create();

            $response = $this->actingAs($this->user)
                ->putJson("/api/posts/{$post->id}", [
                    'title' => 'Updated Title',
                    'content' => $post->content,
                ]);

            $response->assertStatus(200);

            $this->assertDatabaseHas('posts', [
                'id' => $post->id,
                'title' => 'Updated Title',
            ]);
        });

        it('prevents non-author from updating post', function () {
            $otherUser = User::factory()->create();
            $post = Post::factory()->for($otherUser, 'author')->create();

            $response = $this->actingAs($this->user)
                ->putJson("/api/posts/{$post->id}", [
                    'title' => 'Hacked Title',
                ]);

            $response->assertStatus(403);
        });
    });

    describe('DELETE /posts/{post}', function () {
        it('soft deletes a post', function () {
            $post = Post::factory()->for($this->user, 'author')->create();

            $response = $this->actingAs($this->user)
                ->deleteJson("/api/posts/{$post->id}");

            $response->assertStatus(204);

            $this->assertSoftDeleted('posts', ['id' => $post->id]);
        });
    });
});
```

## Tips for Writing Effective Tests

1. **Follow AAA Pattern**
   - **Arrange**: Set up test data and dependencies
   - **Act**: Execute the code being tested
   - **Assert**: Verify the expected outcome

2. **Use Descriptive Test Names**
   - `it('sends email when user registers')` ✓
   - `test('test_method')` ✗

3. **Test One Thing Per Test**
   - Each test should verify one specific behavior
   - Makes failures easier to diagnose

4. **Use Factories Liberally**
   - Create realistic test data with factories
   - Use factory states for different scenarios

5. **Mock External Dependencies**
   - Mock Mail, Queue, Storage, HTTP clients
   - Prevents actual emails/jobs/API calls in tests

6. **Test Edge Cases**
   - Empty inputs, null values
   - Boundary conditions
   - Error scenarios

7. **Leverage Datasets**
   - Use `->with()` for parameterized tests
   - Test multiple scenarios efficiently

8. **Keep Tests Fast**
   - Use `RefreshDatabase` instead of migrations
   - Mock slow operations
   - Avoid unnecessary database queries

## Integration with Other Skills

This skill works well with:

- **code-review**: Understand code structure before writing tests
- **quality-check**: Screen code quality before relying on tests

## Limitations

- Cannot write tests for poorly structured code
- Requires understanding of business logic
- May need manual adjustment for complex scenarios
- Test quality depends on code quality

## Success Criteria

Tests are successful when:

- ✓ All tests pass on first run
- ✓ Tests are readable and well-organized
- ✓ Edge cases are covered
- ✓ Mocking is used appropriately
- ✓ Test names clearly describe behavior
- ✓ Factories provide realistic data
- ✓ Tests run quickly (< 1 second each)
- ✓ Tests are independent (can run in any order)

## Additional resources

- For Pest syntax patterns, Laravel testing patterns, factory generation, and common test patterns, see [reference.md](reference.md)
- For complete example test outputs, see [examples.md](examples.md)

## Important Notes

1. **Run Tests Frequently**: Execute tests after each change
2. **Use RefreshDatabase**: Ensures clean database state
3. **Mock External Services**: Never hit real APIs/send real emails in tests
4. **Follow Pest Conventions**: Use `it()` for readable test names
5. **Keep Tests Isolated**: Each test should be independent
6. **Test Behavior, Not Implementation**: Focus on outcomes, not internals

Remember: Good tests are your safety net for refactoring and adding features. Use **code-review** subagent to ensure the code you're testing follows best practices before writing tests.

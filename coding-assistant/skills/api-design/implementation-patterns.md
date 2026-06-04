# API Design - Implementation Patterns

Reference implementations for the API design patterns described in [SKILL.md](SKILL.md).

## Implementation Patterns

### Laravel (Recommended)

```php
// routes/api.php
Route::prefix('v1')->middleware('throttle:api')->group(function () {
    Route::apiResource('users', UserController::class);
    Route::get('users/{user}/orders', [UserOrderController::class, 'index']);
});

// app/Http/Requests/StoreUserRequest.php
class StoreUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'unique:users,email'],
            'name' => ['required', 'string', 'min:1', 'max:100'],
        ];
    }
}

// app/Http/Resources/UserResource.php
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}

// app/Http/Controllers/UserController.php
class UserController extends Controller
{
    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = User::create($request->validated());

        return response()->json(
            ['data' => new UserResource($user)],
            Response::HTTP_CREATED,
            ['Location' => route('users.show', $user)]
        );
    }

    public function index(Request $request): JsonResponse
    {
        $users = User::query()
            ->when($request->query('status'), fn ($q, $status) => $q->where('status', $status))
            ->when($request->query('q'), fn ($q, $search) => $q->where('name', 'like', "%{$search}%"))
            ->when($request->query('sort'), function ($q, $sort) {
                $direction = str_starts_with($sort, '-') ? 'desc' : 'asc';
                $column = ltrim($sort, '-');
                $q->orderBy($column, $direction);
            })
            ->paginate($request->query('per_page', 20));

        return UserResource::collection($users)->response();
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['data' => new UserResource($user)]);
    }
}
```

### Plain PHP (No Framework)

```php
// Simple router pattern
$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Parse JSON body
$body = json_decode(file_get_contents('php://input'), true);

// Route: POST /api/v1/users
if ($method === 'POST' && preg_match('#^/api/v1/users$#', $path)) {
    // Validate
    $errors = [];
    if (empty($body['email']) || !filter_var($body['email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = ['field' => 'email', 'message' => 'Must be a valid email address', 'code' => 'invalid_format'];
    }
    if (empty($body['name']) || strlen($body['name']) > 100) {
        $errors[] = ['field' => 'name', 'message' => 'Required, max 100 characters', 'code' => 'invalid_length'];
    }

    if ($errors) {
        http_response_code(422);
        echo json_encode([
            'error' => [
                'code' => 'validation_error',
                'message' => 'Request validation failed',
                'details' => $errors,
            ],
        ]);
        exit;
    }

    // Create user (using PDO with parameterized queries)
    $stmt = $pdo->prepare('INSERT INTO users (email, name) VALUES (:email, :name)');
    $stmt->execute(['email' => $body['email'], 'name' => $body['name']]);
    $userId = $pdo->lastInsertId();

    $user = $pdo->query("SELECT * FROM users WHERE id = {$userId}")->fetch(PDO::FETCH_ASSOC);

    http_response_code(201);
    header("Location: /api/v1/users/{$userId}");
    echo json_encode(['data' => $user]);
    exit;
}

// Route: GET /api/v1/users
if ($method === 'GET' && preg_match('#^/api/v1/users$#', $path)) {
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $perPage = min(100, max(1, (int) ($_GET['per_page'] ?? 20)));
    $offset = ($page - 1) * $perPage;

    $total = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $users = $pdo->query("SELECT * FROM users ORDER BY created_at DESC LIMIT {$perPage} OFFSET {$offset}")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'data' => $users,
        'meta' => [
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => (int) ceil($total / $perPage),
        ],
    ]);
    exit;
}
```

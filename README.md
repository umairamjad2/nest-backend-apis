# NestJS Backend – Authentication & User Management

A backend learning project built with **NestJS, TypeScript, PostgreSQL, and Prisma ORM**. This project implements user management, secure authentication, JWT access and refresh tokens, and role-based authorization.

## Tech Stack

- **NestJS** – Backend framework
- **TypeScript** – Programming language
- **PostgreSQL** – Relational database
- **Prisma ORM** – Database management
- **JWT** – Authentication
- **Passport.js** – Authentication strategy
- **Bcrypt** – Password and refresh token hashing
- **Class Validator** – Request validation
- **pnpm** – Package manager

## Features

### 1. User Management (CRUD)

- Create users
- Get all users
- Get a user by ID
- Update user details
- Delete users
- Validate incoming request data
- Store user information in PostgreSQL

### 2. Authentication

- User login with email and password
- Password hashing using bcrypt
- JWT-based authentication
- Protected API endpoints
- Secure token verification

### 3. Access & Refresh Tokens

| Token | Expiration | Purpose |
|---|---|---|
| Access Token | 15 minutes | Access protected APIs |
| Refresh Token | 7 days | Generate new access tokens |

Implemented security features:

- Separate access and refresh token secrets
- Refresh token hashing and database storage
- Refresh token verification
- Refresh token rotation
- Refresh token revocation on logout
- Immediate access token invalidation using token versioning

### 4. Role-Based Access Control (RBAC)

Two user roles are supported:

- **ADMIN** – Access to administrator-protected endpoints
- **USER** – Access to regular user functionality

Implemented using:
- Custom `@Roles()` decorator
- `RolesGuard`
- `JwtAuthGuard`

### 5. Request Validation

Uses `class-validator`, `class-transformer`, and NestJS `ValidationPipe` to validate incoming requests and reject unexpected properties.

## Project Setup

### Prerequisites

Make sure you have installed:

- Node.js
- pnpm
- PostgreSQL
- Git

### 1. Clone the repository

```bash
git clone YOUR_REPOSITORY_URL
cd nestjs-learning
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/nestjs_learning?schema=public"

JWT_ACCESS_SECRET="YOUR_ACCESS_SECRET"
JWT_REFRESH_SECRET="YOUR_REFRESH_SECRET"
```

Generate secure JWT secrets using:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run the command twice to generate two different secrets.

**Important:** Never commit your `.env` file or expose your JWT secrets.

### 4. Set up the database

Create a PostgreSQL database named:

```text
nestjs_learning
```

Run Prisma migrations:

```bash
pnpm exec prisma migrate dev
```

Generate Prisma Client:

```bash
pnpm exec prisma generate
```

### 5. Start the application

Development mode:

```bash
pnpm start:dev
```

The application will run on:

```text
http://localhost:3000
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Authenticate a user |
| POST | `/auth/refresh` | Generate new tokens |
| POST | `/auth/logout` | Log out and revoke tokens |
| GET | `/auth/profile` | Get authenticated user profile |
| GET | `/auth/admin` | Admin-only endpoint |

### User Management

| Method | Endpoint | Description |
|---|---|---|
| POST | `/users` | Create a user |
| GET | `/users` | Get all users |
| GET | `/users/:id` | Get user by ID |
| PATCH | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |

Protected endpoints require an access token in the Authorization header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Refresh Token Request

Send the refresh token in the request body:

```json
{
  "refreshToken": "YOUR_REFRESH_TOKEN"
}
```

Endpoint:

```http
POST /auth/refresh
```

## Authentication Flow

1. User registers with their details.
2. Password is hashed using bcrypt.
3. User logs in with email and password.
4. Server generates an access token and refresh token.
5. Refresh token is hashed and stored in PostgreSQL.
6. Access token is used to access protected APIs.
7. When the access token expires, the refresh token generates new tokens.
8. Refresh token rotation replaces the previously stored hash.
9. On logout, the refresh token is removed and the user's token version is incremented.
10. Old access tokens are rejected by the authentication strategy.

## Role-Based Authorization

Example of an admin-only endpoint:

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get('admin')
adminDashboard() {
  return {
    message: 'Welcome Admin! You have access.',
  };
}
```

Expected authorization responses:

| Scenario | Status |
|---|---|
| Valid ADMIN token | 200 OK |
| Valid USER token | 403 Forbidden |
| Missing token | 401 Unauthorized |
| Invalid or revoked token | 401 Unauthorized |

## Database Management

Open Prisma Studio to view and manage database records:

```bash
pnpm exec prisma studio
```

Create a new migration after changing the Prisma schema:

```bash
pnpm exec prisma migrate dev --name migration_name
```

Generate Prisma Client:

```bash
pnpm exec prisma generate
```

## Running Tests

Run unit tests:

```bash
pnpm test
```

Run end-to-end tests:

```bash
pnpm test:e2e
```

Run test coverage:

```bash
pnpm test:cov
```

## Project Structure

```text
src/
├── auth/
│   ├── decorators/
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── dto/
│   │   └── refresh-token.dto.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
│
├── users/
│   ├── dto/
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
│
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
│
├── app.module.ts
└── main.ts

prisma/
└── schema.prisma

.env
```

*The structure above highlights the main project files; additional files may exist.*

## Learning Goals

This project is part of my hands-on learning journey with NestJS and backend development.

Key concepts practiced:

- NestJS modules, controllers, and services
- REST API development
- DTOs and validation
- PostgreSQL database integration
- Prisma ORM
- Password hashing
- JWT authentication
- Refresh token rotation
- Authentication guards
- Role-based authorization
- Database-backed token revocation

## Future Improvements

- Forgot password and reset password
- Email verification
- Login rate limiting
- Automated API testing
- Swagger API documentation
- Production deployment

## License

This project is for learning and development purposes.

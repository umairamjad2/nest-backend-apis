# NestJS Backend – Authentication & User Management

A backend learning project built with **NestJS, TypeScript, PostgreSQL, and Prisma ORM**. This project implements user management, secure authentication, email verification, password reset, JWT access and refresh tokens, role-based authorization, rate limiting, and Swagger API documentation.

This is the API behind **TaskNest**, a full-stack task manager.

- 🔗 **Live app:** https://nest-frontend-apis.vercel.app
- ⚙️ **API:** https://nest-backend-apis.vercel.app (protected routes return `401` without a token)
- 🎨 **Frontend repo:** https://github.com/umairamjad2/nest-frontend-apis

## Tech Stack

- **NestJS** – Backend framework
- **TypeScript** – Programming language
- **PostgreSQL** – Relational database
- **Prisma ORM** – Database management
- **JWT** – Authentication
- **Passport.js** – Authentication strategy
- **Bcrypt** – Password hashing
- **SHA-256 (Node.js crypto)** – Refresh, password reset, and email verification token hashing
- **Class Validator** – Request validation
- **Nodemailer** – Verification and password reset emails
- **Custom throttle guard** – Rate limiting (replaces `@nestjs/throttler`, which can't load in Vercel's serverless runtime)
- **Swagger (OpenAPI)** – API documentation
- **Vitest** – Testing
- **pnpm** – Package manager

## Features

### 1. User Management

- List all users (admin only)
- Get or update a user (own account or admin)
- Delete users (admin only)
- Users are created through `POST /auth/register`, so nobody can bypass email verification
- `PATCH /users/:id` accepts only `name`; `role`, `email`, and `password` are rejected

### 2. Authentication

- User registration with email verification
- Login is blocked until the email is verified
- User login with email and password
- Forgot password and reset password by email
- `forgot-password` gives the same response whether or not the email exists
- Change password while logged in (needs the current password). Signs out every other device and sends a "password changed" email
- Delete your own account (needs your password). The last admin can't delete their own account
- Password hashing using bcrypt
- JWT-based authentication
- Protected API endpoints

### 3. Access & Refresh Tokens

| Token | Expiration | Purpose |
|---|---|---|
| Access Token | 15 minutes | Access protected APIs |
| Refresh Token | 7 days | Generate new access tokens |

Implemented security features:

- Separate access and refresh token secrets
- Refresh token is sent in an `httpOnly` cookie (`refresh_token`, path `/auth`), so frontend JavaScript cannot read it
- Refresh tokens are hashed with SHA-256 before database storage
- Every refresh token has a unique ID (`jti`), stored on its session
- Refresh token rotation: every refresh returns a new token and the old one stops working
- Atomic rotation, so one refresh token cannot be used twice by concurrent requests
- Reuse detection: sending an old refresh token ends that session
- Immediate access token revocation: access tokens carry their session ID (`sid`), and every request checks that the session still exists

### 4. Multi-Device Sessions

Each login creates a row in the `Session` table, so a user can be logged in on several devices at once.

- Each session stores its own refresh token hash and `jti`, the device's user agent and IP, and when it was last used
- `GET /auth/sessions` lists the user's devices and marks the current one
- Users can sign out one device, or every device except the current one
- Logout ends only the current device's session
- Changing the password signs out every other device; resetting it signs out all devices
- Sessions expire 7 days after their last refresh, and a user can have at most 10 (logging in on an 11th device ends the least recently used one)

### 5. Role-Based Access Control (RBAC)

Two user roles are supported:

- **ADMIN** – Access to administrator-protected endpoints
- **USER** – Access to regular user functionality

Implemented using:
- Custom `@Roles()` decorator
- `RolesGuard`
- `JwtAuthGuard`
- `SelfOrAdminGuard` – allows admins or the user who owns the account

### 6. Request Validation

Uses `class-validator`, `class-transformer`, and NestJS `ValidationPipe` to validate incoming requests and reject unexpected properties.

### 7. CORS

Only the frontend at `FRONTEND_URL` (default `http://localhost:3001`) may call the API from a browser, with cookies allowed.

### 8. Rate Limiting

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 requests per minute |
| `POST /auth/register` | 5 requests per minute |
| `POST /auth/forgot-password` | 3 requests per minute |
| `POST /auth/change-password` | 5 requests per minute |
| `DELETE /auth/account` | 5 requests per minute |
| All other endpoints | 10 requests per minute |

Requests over the limit receive `429 Too Many Requests`.

### 9. API Documentation

Interactive Swagger documentation is available at `/api`, and the OpenAPI JSON at `/api-json`. Both are disabled when `NODE_ENV` is `production`.

## Project Setup

### Prerequisites

Make sure you have installed:

- Node.js
- pnpm
- PostgreSQL
- Git
- An SMTP email account (for verification and password reset emails)

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

MAIL_HOST="YOUR_SMTP_HOST"
MAIL_PORT="587"
MAIL_USER="YOUR_SMTP_USERNAME"
MAIL_PASSWORD="YOUR_SMTP_PASSWORD"

FRONTEND_URL="http://localhost:3001"

NODE_ENV="development"
```

Keep `NODE_ENV="development"` locally, or Swagger will return 404. Set `NODE_ENV=production` only on the live server; it also marks the refresh cookie `Secure`, so production must use HTTPS. `PORT` is optional and defaults to `3000`.

`FRONTEND_URL` is the only origin allowed by CORS and is used in password reset links. It has no trailing slash.

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

Swagger documentation:

```text
http://localhost:3000/api
```

To call protected routes in Swagger, log in with `POST /auth/login`, click **Authorize**, and paste the `access_token` without the word `Bearer`. Login also sets the refresh cookie in your browser, so `POST /auth/refresh` works in Swagger with no input.

### 6. Create an admin user

New accounts always have the `USER` role. To create the first admin, register a user, then open Prisma Studio and change that user's `role` to `ADMIN`:

```bash
pnpm exec prisma studio
```

## API Endpoints

### Authentication

| Method | Endpoint | Description | Access |
|---|---|---|---|
| POST | `/auth/register` | Create an account and send a verification email | Public |
| GET | `/auth/verify-email?token=` | Verify an email address | Public |
| POST | `/auth/login` | Return an access token and set the refresh cookie | Public |
| POST | `/auth/refresh` | Return a new access token and set a new refresh cookie | Public, needs refresh cookie |
| POST | `/auth/forgot-password` | Email a password reset link | Public |
| POST | `/auth/reset-password` | Set a new password using a reset token | Public |
| POST | `/auth/logout` | Log out this device and clear the refresh cookie | Logged in |
| POST | `/auth/change-password` | Change the password (`currentPassword`, `newPassword`); signs out other devices | Logged in |
| GET | `/auth/sessions` | List logged-in devices (`current: true` marks this one) | Logged in |
| DELETE | `/auth/sessions/:id` | Sign out one device | Logged in |
| DELETE | `/auth/sessions` | Sign out every device except this one | Logged in |
| DELETE | `/auth/account` | Delete your own account and tasks (body: `password`) | Logged in |
| GET | `/auth/profile` | Get authenticated user profile | Logged in |
| GET | `/auth/admin` | Admin-only endpoint | Admin |

### User Management

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/users` | Get all users | Admin |
| GET | `/users/:id` | Get user by ID | Own account or admin |
| PATCH | `/users/:id` | Update the user's name | Own account or admin |
| DELETE | `/users/:id` | Delete user | Admin |

Protected endpoints require an access token in the Authorization header:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Refresh Token Cookie

The refresh token never appears in a response body. Login and refresh set it as a cookie:

```http
Set-Cookie: refresh_token=...; Max-Age=604800; Path=/auth; HttpOnly; SameSite=Lax
```

`POST /auth/refresh` takes no body. It reads the cookie, returns `{ "access_token": "..." }`, and replaces the cookie with a new one. Reusing an old refresh token returns `401 Refresh token reuse detected` and ends that session, so that device must log in again.

### Frontend Requirements

- Send `credentials: 'include'` (fetch) or `withCredentials: true` (axios) on login, refresh and logout, or the browser will not store or send the cookie.
- Keep the access token in memory, not `localStorage`. After a page reload, call `POST /auth/refresh` to get a new one.
- On a `401`, call `/auth/refresh` once and retry the request. Allow only one refresh request at a time; parallel requests share its result.

## Authentication Flow

1. User registers with their details.
2. Password is hashed using bcrypt and a verification email is sent. The link is valid for 24 hours.
3. User verifies their email.
4. User logs in with email and password.
5. Server creates a session for this device, returns an access token and sets the refresh token as an `httpOnly` cookie. Both tokens carry the session ID.
6. A SHA-256 hash of the refresh token and its `jti` are stored on the session in PostgreSQL.
7. Access token is used to access protected APIs. Each request checks that its session still exists.
8. When the access token expires, the refresh token generates new tokens.
9. Refresh token rotation replaces the session's stored hash and `jti`, so the old refresh token stops working.
10. If an old refresh token is reused, that session is deleted.
11. On logout, the session is deleted and the cookie is cleared. Other devices stay logged in.
12. Access tokens of a deleted session are rejected straight away by the authentication strategy.

Password reset links are valid for 15 minutes. A successful reset ends all of the user's sessions.

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

Routes marked **Own account or admin** also return `403 Forbidden` when a normal user requests another user's account.

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

The default `should be defined` specs in `src/auth`, `src/users`, and `src/mail` currently fail because they do not provide their dependencies. Automated auth tests still need to be added.

## Project Structure

```text
src/
├── auth/
│   ├── decorators/
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts
│   │   └── self-or-admin.guard.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── dto/
│   │   ├── forgot-password.dto.ts
│   │   └── reset-password.dto.ts
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
├── mail/
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
- Multi-device sessions
- Email verification, password reset and password change
- Rate limiting
- Swagger API documentation

## Future Improvements

- Configurable backend URL for email verification links
- Change email flow
- Automated auth testing
- Production deployment

## License

This project is for learning and development purposes.

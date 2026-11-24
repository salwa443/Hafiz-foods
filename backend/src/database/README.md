# Database Setup

This folder contains the PostgreSQL database scripts for the restaurant ordering system.

## Environment

Create `backend/.env` from `backend/.env.example` and set:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/qr_menu_ordering
```

Use your actual PostgreSQL username, password, host, port and database name.

## Commands

Install backend dependencies first:

```bash
npm install
```

Check the database connection:

```bash
npm run db:check
```

Run migrations and seed data:

```bash
npm run db:migrate
```

The seed creates staff roles, tables T01-T05, four menu categories and ten sample menu items.

## Create a Secure Initial Admin

For a real setup, create an admin with your own password instead of relying on sample seed users:

```bash
node src/database/createInitialAdmin.js "Admin User" admin@restaurant.com "StrongPassword123"
```

The password is hashed with bcrypt before it is stored. Plain-text passwords must never be inserted into the database.

To create test users for role-based access checks:

```bash
node src/database/createStaffUser.js kitchen "Kitchen Staff" kitchen@restaurant.com "StrongPassword123"
node src/database/createStaffUser.js waiter "Waiter User" waiter@restaurant.com "StrongPassword123"
```

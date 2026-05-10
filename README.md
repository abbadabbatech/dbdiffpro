# DB Diff Pro 🚀

**DB Diff Pro** is a modern SaaS platform designed to simplify database synchronization. Compare schemas between PostgreSQL and MySQL instances, generate migration scripts, and synchronize your databases with a single click.

## Features ✨

- **Multi-DB Support**: Full support for PostgreSQL and MySQL introspection and synchronization.
- **Visual Schema Diffing**: Beautifully formatted review of table columns, functions, and triggers.
- **Batch Synchronization**: Select multiple differences and apply them in a single, safe transaction.
- **SaaS Ready**: Built-in authentication (Supabase), RBAC (Individual/Team roles), and Stripe subscription management.
- **Guest Mode**: Use the engine anonymously or log in to save your connection targets.
- **Theme Support**: Professional Light and Dark modes with a clean, authoritative UI.

## Tech Stack 🛠️

- **Frontend**: React 19, Vite, Lucide Icons, Monaco Editor (for SQL review).
- **Backend**: Node.js, Express, Supabase JS Client.
- **Database Logic**: `pg` (Postgres), `mysql2` (MySQL).
- **Styling**: Vanilla CSS with a custom design system.
- **Auth & Storage**: Supabase Auth & PostgreSQL.
- **Payments**: Stripe (via Supabase Edge Functions).

## Getting Started 🏁

### Prerequisites

- Node.js 20+
- A Supabase project
- A Stripe account (optional, for payments)

### Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```
3. Set up your environment variables:
   - Create `client/.env` (see `client/.env.example`)
   - Create `server/.env` (see `server/.env.example`)
4. Run the database migrations using `schema.sql` in your Supabase SQL Editor.
5. Start the development servers:
   - Server: `cd server && node index.js`
   - Client: `cd client && npm run dev`

## Deployment ☁️

The project includes a `Dockerfile` optimized for Google Cloud Run. 

1. Build the image:
   ```bash
   docker build -t gcr.io/[PROJECT_ID]/dbdiffpro .
   ```
2. Push and Deploy:
   ```bash
   docker push gcr.io/[PROJECT_ID]/dbdiffpro
   gcloud run deploy dbdiffpro --image gcr.io/[PROJECT_ID]/dbdiffpro --platform managed --port 8080
   ```

## License 📄

MIT

---
Built with ❤️ by [Abba Dabba Tech](https://github.com/abbadabbatech)

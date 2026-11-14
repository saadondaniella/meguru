# MEGURU — Wear it. Pass it on.

A secondhand fashion marketplace built with Angular, Supabase and Stripe.

MEGURU is a C2C marketplace where users can buy, sell and give away pre-loved clothing. Sellers can create their own storefronts, publish listings and customize their profiles, while visitors can explore the marketplace without an account.

The name *MEGURU* (巡る) comes from the Japanese word meaning "to circulate", reflecting the idea of giving clothing a new life.

**Live website:** https://meguru-secondhand.netlify.app/

## Features

- Browse, search, sort and filter secondhand clothing.
- Create an account and manage a personal seller profile.
- Create, edit and manage product listings with images.
- Customize and share a public seller storefront.
- Save favourite listings and ask sellers questions.
- Purchase items securely through Stripe Checkout.
- Choose between shipping and local pickup.
- Manage purchases, sales and order statuses.

## Tech Stack

- **Frontend:** Angular 22, TypeScript, HTML, CSS
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Payments:** Stripe
- **Testing:** Vitest
- **Deployment:** Netlify

## Getting Started

### Prerequisites

- Node.js and npm
- Docker Desktop
- Supabase CLI (available through `npx`)

### Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd meguru
npm install
```

### Local development

Start Docker Desktop, then start the local Supabase stack:

```bash
npx supabase start
```

In a separate terminal, start Angular:

```bash
npm start
```

Open http://localhost:4200/ in your browser.

The application uses a local Supabase instance during development. Registration confirmation emails can be accessed through Mailpit at http://127.0.0.1:54324/.

Supabase Studio is available at http://127.0.0.1:54323/.

### Database

Database migrations are located in `supabase/migrations/`.

To reset and rebuild the **local** database:

```bash
npx supabase db reset
```

This resets local data. Do not use `--remote` unless you intentionally want to operate on a remote database.

### Environment configuration

MEGURU uses separate Supabase configurations for development and production:

- `src/environments/environment.ts` — local development
- `src/environments/environment.production.ts` — production

The production configuration is used when building for deployment.

Only public/publishable Supabase keys belong in frontend code. Never expose secret or service-role keys.

Stripe payments require additional server-side configuration and credentials to work in a new environment.

## Testing

Run the unit and component tests:

```bash
npm test
```

Build the application for production:

```bash
npm run build
```

## About

MEGURU was developed as a final degree project at Yrgo in Gothenburg, Sweden, with a focus on fullstack development, user experience and responsive design.

**Wear it. Pass it on.**
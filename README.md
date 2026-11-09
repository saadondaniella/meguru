# Meguru

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Local Supabase

Development uses a local Supabase stack in Docker, never the production project.

1. Start Docker Desktop, then start the local stack:

   ```bash
   npx supabase start
   ```

2. Start Angular in a second terminal:

   ```bash
   ng serve
   ```

3. Open `http://localhost:4200/` (use `localhost`, not `127.0.0.1`: the local auth redirect list is configured for it).

Useful local URLs: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, test emails (Mailpit) `http://127.0.0.1:54324`. Email confirmation is required, as in production, so open confirmation links from Mailpit.

To rebuild the local database from the migrations in `supabase/migrations/`, run `npx supabase db reset`. It only affects the local stack unless you pass `--remote`, so never pass that flag.

### Which Supabase project is used

| Command | Supabase project |
| --- | --- |
| `ng serve`, `ng test`, `npm run watch` | Local (`src/environments/environment.ts`) |
| `ng build` (production, the default) | Production (`src/environments/environment.production.ts` replaces `environment.ts`) |

Only the publishable key belongs in frontend code. Never add a secret or service-role key to `src/`. In development, `src/app/services/supabase.ts` throws if the configured URL is not local. Do not deploy a build made with `--configuration development`.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

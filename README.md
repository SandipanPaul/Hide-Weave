# Hide & Weave

Internal management app for a commission agent: clients place orders, exporters
supply the goods, and the agent earns a percentage of the order value.

Single user, single password, runs locally or on a small VPS.

## Setup

```bash
npm install
cp .env.example .env   # then fill in APP_PASSWORD and SESSION_SECRET
npm run db:migrate     # creates prisma/dev.db and applies migrations
npm run db:seed        # ~15 clients, 10 exporters, 50 projects, ~76 payments
npm run dev            # http://localhost:3000
```

`.env` needs three values:

| Variable         | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `DATABASE_URL`   | `file:./dev.db` for local SQLite                            |
| `APP_PASSWORD`   | The single password that unlocks the app                    |
| `SESSION_SECRET` | Random string, 16+ characters, signs the session cookie     |

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server                                    |
| `npm run build`     | Production build                              |
| `npm run lint`      | ESLint                                        |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm test`          | Vitest unit tests                             |
| `npm run test:e2e`  | Playwright end-to-end tests                   |
| `npm run db:seed`   | Wipe and repopulate with sample data          |
| `npm run db:reset`  | Drop, re-migrate and re-seed                  |
| `npm run db:backup` | Snapshot the database into `backups/`         |
| `npm run db:restore`| Put a snapshot back                           |
| `npm run db:studio` | Prisma Studio                                 |

On macOS 13, Playwright has no bundled Chromium build. Drive an installed
browser instead:

```bash
E2E_BROWSER_CHANNEL=msedge npm run test:e2e
```

## How the money works

Read this before touching anything numeric.

- **Order value** is the total value of the consignment — goods routed through
  the agent. It is never income and is never presented as such.
- **Commission** is the agent's revenue: `round(orderValue × commissionPercentage / 100)`.
  It is always computed, never stored, by `computeCommission` in
  [`src/lib/money.ts`](src/lib/money.ts). No other file does this arithmetic.
- **Payments settle commission**, not order value. A project's balance is
  `commission − payments received`.
- Amounts are integer **minor units** (paise, cents) in a `bigint`. No float
  ever touches a monetary value. Rounding is half-up, in exact integer maths.
- Clients may also be on a **fixed monthly retainer** (`Client.fixedMonthly`),
  which is separate from per-order commission.

### What payments settle

A payment settles the **commission** on a project, not the order value. The
order value is the consignment total — goods routed through the agent — and is
never money owed to them. So a ₹50,00,000 order at 2% is settled by ₹1,00,000.

The ledger maths is [`src/lib/projects/ledger.ts`](src/lib/projects/ledger.ts):
`outstanding` and `overpaid` are separate fields rather than one signed number,
because "outstanding: −500" reads as a debt of minus five hundred, which is not
what an overpayment is. The monthly retainer on a client is separate again and
belongs to no single project.

## Conventions

- **Contacts are lists.** A client can have any number of phone numbers and
  email addresses, held as ordered `ClientContact` rows rather than two columns.
  One parser ([`contacts.ts`](src/lib/contacts.ts)) is shared by the form, the
  CSV import, search and duplicate detection: it splits on `,` `;` `/` `\` and
  newlines, reads `(at)` and `(dot)` as `@` and `.`, and de-duplicates by
  meaning — emails case-insensitively, phones by their digits. The first of each
  kind is the primary one shown in lists. Contacts are values rather than
  records, so editing a client replaces them outright instead of soft-deleting.
- **Countries** are stored as ISO 3166-1 alpha-2 codes, never free text, so the
  same country typed three ways still groups as one. One resolver
  ([`countries.ts`](src/lib/countries.ts)) is shared by the form, the server
  action, the CSV import and search — it accepts a name, a code, or a common
  alias ("USA", "UK", "UAE"), ignoring case, accents and punctuation. Display
  names come from `Intl`, so only the codes are hard-coded.
- **Soft deletes.** Nothing is really deleted; rows get a `deletedAt`. Every
  query spreads `notDeleted` from [`src/lib/db.ts`](src/lib/db.ts).
- **Uniqueness** (client name, order ID, exporter website) is enforced in server
  actions scoped to non-deleted rows, not by database constraints — a deleted
  row must not permanently reserve a name.
- **Statuses are strings**, not Prisma enums, with the allowed values owned by
  Zod in [`src/lib/enums.ts`](src/lib/enums.ts). SQLite has no enum type, so
  Prisma enums would make the Postgres move a rewrite.
- **Dates** are stored UTC. Date-only fields (order date, sampling date, paid
  on) sit at UTC midnight and must be formatted with the UTC-aware helpers in
  [`src/lib/dates.ts`](src/lib/dates.ts).
- **Websites** are stored canonically and compared by
  [`websiteKey`](src/lib/url.ts), which ignores scheme, `www.` and a trailing
  slash — `http://www.example.com/` and `https://example.com` are one supplier.
  A bare domain is accepted and assumed to be `https`, since that is what
  people type.
- **Validation.** Every server action re-validates with the Zod schemas in
  [`src/lib/schemas.ts`](src/lib/schemas.ts). Client-side validation is a
  convenience, never a trust boundary.

## Shared pieces

The three tabs are deliberately the same shape, so the parts they share live in
one place rather than three:

- [`useEntityForm`](src/components/form/use-entity-form.ts) — controlled values,
  live validation against the same Zod schema the server action enforces, and
  the rule about when an error may appear: **typing** marks a field touched,
  not blurring it. Tabbing through a form, or clicking Cancel, never scolds you
  about a field you left alone.
- [`FormFields` / `FormActions`](src/components/form/form-shell.tsx) — the
  scroll area and the buttons below it. The fields take the height *left over*,
  so whatever sits above them cannot push the buttons off the screen.
- [`detail-list.tsx`](src/components/detail/detail-list.tsx) — the label/value
  rows on every detail page, plus the email, phone and external links.
- [`runImport`](src/lib/csv/import-runner.ts) — the transaction every CSV
  import runs inside, including the roll-back-and-name-the-row behaviour.
- [`matchByKey`](src/lib/keys.ts) — the uniqueness scan behind client names,
  order IDs and exporter websites.

## CSV import

One component serves every tab: [`CsvImportDialog`](src/components/csv-import/csv-import-dialog.tsx)
knows nothing about clients or projects. An entity supplies an `ImportConfig`
(fields, header aliases, and a `validateRow` built on its own Zod schema) plus
two server actions — one to find duplicates, one to import. The Clients wiring
is [`client-csv-import.tsx`](src/app/(app)/clients/client-csv-import.tsx); the
config is [`configs/clients.ts`](src/lib/csv/configs/clients.ts). The Projects
tab reuses the same component with
[`configs/projects.ts`](src/lib/csv/configs/projects.ts) — no UI was written
for it.

The flow: upload → map columns → preview with per-row validation and duplicate
decisions → summary → confirm.

- **Mapping** is guessed from header names (aliases included) and every guess is
  overridable. Unmapped columns are ignored, and a field can only be claimed by
  one column.
- **Validation** runs the same `validateRow` in the browser and again in the
  server action, so the preview can never disagree with the import.
- **Duplicates** are matched case-insensitively against existing records *and*
  against earlier rows in the same file — by name or email for clients, by
  order ID for projects. Each one is resolved individually: skip, update the
  existing record, or import anyway.
- **Named references are resolved before import.** A project row names its
  client rather than identifying it, so the preview says "no client called
  Meridian Foods" while you are still looking at the file. The names are
  resolved again server-side inside the transaction — the browser's lookup is
  a convenience, never the decision.
- **The import is one transaction.** Any failure rolls back the whole file and
  reports the row number that stopped it — a half-imported file is worse than
  none.
- **Broken rows can be fixed in place.** Any row can be edited in the preview,
  with per-field errors and live re-validation, so a single typo doesn't mean
  editing the file and starting over. Corrections apply to the import only —
  the file on disk is never touched — and can be undone per row. A filter shows
  just the rows needing attention, so a problem on row 200 is still reachable.
- **Failed rows come back as a CSV** with an added `_error` column, carrying any
  corrections already made, ready to finish and re-upload. A template with
  correct headers is downloadable up front.

Adding an import to another tab means writing a config and two server actions —
no UI work.

## Economics

Every figure on the dashboard is derived from Projects, Payments, Clients and
Samplings — nothing on that page is stored or typed in. The arithmetic lives in
[`aggregate.ts`](src/lib/economics/aggregate.ts) as pure functions over plain
rows, with `today` passed in rather than read from the clock, so all 27 of its
tests run offline and deterministically. The page is only a rendering of what
they return.

Three definitions worth stating, because the spec was ambiguous:

- **Outstanding** is commission owed less payments received — *not* order value
  less payments, which would claim ₹50,00,000 was due on a ₹1,00,000 commission.
- **Commission at risk** is the slice of that outstanding on orders **not yet
  delivered**: the goods have not landed, so the commission is not firmly owed.
- **Monthly retainer** is what active clients are billed each month. It is shown
  as its own card and never folded into cash received, because no payment
  record exists for it.

Two different dates are in play, deliberately: order value and commission are
bucketed by `orderDate`, cash received by `paidOn` — a payment in March against
a January order is March's cash. Outstanding ignores the range entirely and
counts every payment ever made, because it is a balance as of now.

Currencies are never converted. The page shows one currency at a time,
defaulting to whichever has the most orders, and "Export CSV" hands back the
individual orders behind the figures rather than the figures themselves.

## Website extraction

Paste an exporter's URL and the app reads the site to pre-fill the add form.
It never writes to the database: everything lands in the form marked
`auto-filled`, alongside a list of what was picked up and where each value came
from, so a wrong guess is obvious rather than buried. Editing a field clears
its mark.

Parsing is priority-ordered, first hit wins per field
([`parse.ts`](src/lib/extraction/parse.ts)):

1. JSON-LD `Organization` / `LocalBusiness` — `Organization` first, because
   sites stuff the `LocalBusiness` name with search terms
2. Open Graph and standard meta tags
3. `mailto:` and `tel:` hrefs
4. Email and phone patterns in the visible text
5. `<title>`, for the company name only

If the homepage yields no email, **one** contact/about/imprint page is fetched
as well. One extra request, never a crawl.

Fetching ([`fetch.ts`](src/lib/extraction/fetch.ts)) is server-side only, with
a normal User-Agent, a 10-second timeout, at most 3 redirects, 2 MB read, HTML
content types only, and `robots.txt` checked first. Timeout, 403, 404,
non-HTML, TLS and DNS failures each get their own message.

**Addresses are filtered** ([`net.ts`](src/lib/extraction/net.ts)). The URL
comes from the user, so without this the server would fetch
`http://169.254.169.254/` or `http://127.0.0.1:5432/` from inside the network
and show the response. Loopback, private, link-local, carrier-NAT and
IPv4-mapped-IPv6 addresses are all refused, hostnames are resolved and their
addresses checked, and redirects are followed by hand so every hop is checked
too. This was not in the spec; it is not optional.

The exporter detail page has **Re-read site**, which fetches again and shows a
field-by-field diff of old versus new. Nothing is pre-accepted and a blank
never replaces a value you have — a site redesign is likelier to make a field
worse than better.

Tests run against
[seven pages saved from real exporter sites](src/lib/extraction/__fixtures__),
never the live network.

## Deploying to a small VPS

```bash
git clone https://github.com/SandipanPaul/Hide-Weave.git /srv/hide-weave
cd /srv/hide-weave
bash scripts/deploy.sh your-hostname
```

That installs Caddy, writes `.env` (generating `SESSION_SECRET` and prompting
for the password), installs dependencies, creates an empty database, builds,
registers a systemd service, gets an HTTPS certificate, and opens ports 80 and
443. It is safe to run again — it never overwrites an existing `.env`.

### You need a hostname, not an IP

**Certificates are only issued to names.** There is no way to get a public
certificate for a bare IP address, and this app refuses to work without one:
the session cookie is `Secure` in production, so over plain HTTP the browser
accepts the login and then declines to send the cookie back. Everyone sees the
sign-in page again with no error, and concludes the password is broken.

If you only have an IP, pick one of these:

| | |
| --- | --- |
| **A domain** | ~$10/year. One A record at the IP. Best if partners will see the URL. |
| **DuckDNS** | Free `yourname.duckdns.org`, two minutes, no card. |
| **sslip.io** | No signup at all: `203-0-113-5.sslip.io` resolves to `203.0.113.5`. The URL advertises your IP. |
| **Cloudflare Tunnel** | No open ports at all. Needs a domain for a named tunnel. |

Do not work around this with a self-signed certificate — every partner clicks
through a browser warning every time — and do not relax the `Secure` flag to
run on plain HTTP, which puts the password and session cookie in cleartext on
the open internet.

### Oracle Cloud

Two things catch people out on Oracle images:

- **Ports are blocked twice.** The script opens them in the server's own
  iptables; you must *also* allow 80 and 443 in the VCN security list from the
  Oracle console. Opening only one of the two looks exactly like a broken
  server.
- **The free tier is ARM.** `better-sqlite3` is a native module. If `npm ci`
  starts compiling rather than downloading, install `build-essential` and
  `python3` first.

### What it installed

| | |
| --- | --- |
| `/etc/systemd/system/hide-weave.service` | keeps the app running, restarts it on failure |
| `/etc/caddy/Caddyfile` | HTTPS in front of port 3000 |
| `.env` | the password and session secret — **not** in git, **not** in backups |
| `prisma/prod.db` | the database, empty until you import |

```bash
sudo systemctl status hide-weave    # what the app is doing
sudo journalctl -u hide-weave -f    # its logs
```

### Updating

```bash
cd /srv/hide-weave
git pull
npm ci
npx prisma migrate deploy
npm run build
sudo systemctl restart hide-weave
```

The running app serves the previous build until the restart, which is fine for
this many users.

## Production database

Development and production use **separate database files**, so a demo dataset
can never end up in the real one:

```bash
npm run db:prod:init    # creates prisma/prod.db with the schema and nothing else
npm run start:prod      # runs the built app against prisma/prod.db
```

`db:prod:init` runs `prisma migrate deploy` — migrations only, no seed. The
result is an empty database: every tab shows its empty state with a way in, and
clients arrive through **Import CSV** on the Clients tab.

`npm run db:seed` **deletes everything before repopulating**, so it refuses to
run against anything that does not look like a development database. Override
with `ALLOW_SEED=1` only on a machine you are happy to lose.

On a real server, point `DATABASE_URL` at the production file in that machine's
own `.env` and use `npm start` as normal — the two scripts above exist so both
databases can live side by side on one laptop.

## Backups

The whole database is one file. That makes it easy to lose and easy to save.

```bash
npm run db:backup              # snapshot into backups/
npm run db:restore -- --list   # what is available
npm run db:restore             # put the newest one back
npm run db:restore -- hide-and-weave-2026-08-21-17-54.db
```

`db:backup` uses SQLite's `VACUUM INTO` rather than copying the file. That
matters: a plain `cp` of a live database can catch a half-written page and
misses the write-ahead log, so what you get back may not open. `VACUUM INTO`
takes a read lock and writes a consistent, compacted database, and it is safe
to run while the app is serving. Each run verifies the snapshot by opening it
and counting rows, and keeps the newest 14 (`BACKUP_KEEP` to change that).

`db:restore` copies the current database aside before replacing it — the usual
reason to restore is that something has already gone wrong, and the
second-worst outcome is finding out you restored the wrong snapshot with
nothing to go back to. **Stop the app first**: replacing the file underneath a
running server leaves it holding a handle to a database that no longer exists.

**A backup on the same disk is not a backup.** `backups/` protects you from a
bad import, a wrong delete or a `db:reset` — not from losing the machine. Copy
them somewhere else on a schedule:

```cron
# 02:00 daily: snapshot, then sync off the box
0 2 * * * cd /srv/hide-and-weave && /usr/bin/npm run db:backup >> /var/log/hw-backup.log 2>&1
30 2 * * * rsync -a /srv/hide-and-weave/backups/ backup-host:/backups/hide-and-weave/
```

`.env` is **not** in the backup and is not in git. Keep `APP_PASSWORD` and
`SESSION_SECRET` in a password manager: restoring a database onto a machine
that cannot decrypt its session cookies leaves you locked out of your own data.

The scripts are covered by [`tests/backup.test.ts`](tests/backup.test.ts),
which runs them against real SQLite files in a temp directory — including a
backup taken mid-write, the pruning arithmetic, and a full restore of a wiped
database. Backup tooling has to work the first time it is needed, and by then
it is too late to find out.

## Theme

Light, dark, or follow the system, chosen from the header and remembered.

The trigger's icon is swapped by CSS rather than by React state — the server
cannot know the reader's theme, so choosing in JS means either a hydration
mismatch or a flag that flickers on load. Keying off the same `dark` class the
theme itself sets means the icon cannot disagree with the page.

Recharts colours legend and tooltip text with the *series* colour, so a
deliberately subtle series ends up as near-invisible words — "Order value
routed" in near-white on white, "Closed : 3" in a grey barely above the
tooltip's own background. Swatches keep the series colour; the words use the
foreground.

Chart colours are defined twice, and **reversed** in dark mode. The ramp means
"subtle at 1, prominent at 5", which in light is near-white to near-black; the
dark block had originally been copied verbatim from light, which put the
emphasis line in the darkest grey available on an almost-black background.

## Accessibility

Checked by [`e2e/a11y.spec.ts`](e2e/a11y.spec.ts) rather than by eye, so a
control added later without a name fails the suite. It walks every tab and
every add dialog and asserts that:

- every button and link announces something — the failure mode that actually
  happens is an icon-only control with nothing to read out
- every form control has a label, and every `aria-describedby` points at an
  element that exists
- decorative icons are hidden rather than read out as "graphic"
- each page has exactly one `h1` and the usual landmarks
- dialogs are named, take focus, close on Escape, and return focus to whatever
  opened them
- focus is visibly ringed, since the design system removes the browser default

Colour contrast is computed, not eyeballed: `emerald-600` and `amber-600` are
fine for the large card figures (3.67:1 and 3.19:1 against a 3:1 requirement)
but fail for small text, so the sentence-sized uses are `-700` (5.37:1 and
5.05:1 against 4.5:1).

Charts carry `role="img"` and one description each. Every figure they draw is
also available as text in the cards and tables, so nothing is only in a
picture.

## Moving to Postgres

The schema avoids everything SQLite-specific, so this is a configuration change:

1. `npm i @prisma/adapter-pg pg` and remove the better-sqlite3 adapter.
2. In [`prisma/schema.prisma`](prisma/schema.prisma), change the datasource
   `provider` from `"sqlite"` to `"postgresql"`.
3. In [`src/lib/db.ts`](src/lib/db.ts), swap `PrismaBetterSqlite3` for
   `PrismaPg`.
4. Point `DATABASE_URL` at the Postgres server.
5. `npx prisma migrate dev --name init-postgres` against the new database.

No application code changes: money is `BigInt` (`int8` on Postgres), statuses
are `String`, and there are no raw SQLite queries.

## Project status

Built in milestones. Current state:

- [x] **1.** Scaffold, Prisma schema + migrations, seed script, tab shell, password gate
- [x] **2.** Clients tab: list, detail, manual add, samplings
- [x] **3.** Reusable CSV import, wired into Clients
- [x] **4.** Projects tab: list, detail, payments ledger, CSV import
- [x] **5.** Exporters tab: CRUD, then website extraction
- [x] **6.** Economics: tested aggregate functions, then the dashboard
- [x] **7.** Polish: empty states, error handling, accessibility

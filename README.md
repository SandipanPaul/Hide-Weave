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

## References

Clients and orders each carry a short reference alongside their cuid primary
key — `HWC00042` and `ORD00000042`. The database needs an id that is unique and
stable; a person needs one they can quote in an email subject and search a
mailbox for. Those are different jobs, and one value does both badly. Letters
and digits with no separator, so each is one unbroken token a mailbox search
cannot half-match, and orders are padded wider than clients so the two cannot
be misread for one another.

Both come from one generator ([`codes.ts`](src/lib/codes.ts)), which takes the
highest number in use and adds one — **not** a row count. A deleted record
never frees its number: a reference that pointed at two records over time would
make the correspondence quoting it ambiguous, which is the whole reason for
having one. Padding is cosmetic; a series counts past it (`HWC99999` is
followed by `HWC100000`) rather than wrapping, so it cannot run out. The next
number is read inside the transaction that writes the record, so importing a
CSV of new rows numbers them in sequence rather than issuing one repeatedly.

Order references are **issued, never typed** — the Order ID field shows the
reference rather than accepting one. The projects importer still reads an Order
ID column, but only to recognise a row as an existing order, which is what makes
an exported file editable and re-importable; a blank one creates a new order
with a fresh reference.

A client's own number is a **separate field**, `clientReference`, because it is
theirs: their PO number, in their format, and it is what their emails quote. It
is never generated, validated or required — `4500123`, `PO/2026/0417` and
`po-17b` are all stored exactly as given — and it is searchable, which is the
entire point of keeping it. Header guessing keeps the two apart: a column headed
"Order No." maps to our reference, while "PO", "Purchase Order" or "Buyer Ref"
map to theirs.

Client references show under the name in the list, beside the name on the
client's page, and in their details. Searching accepts the full code, the bare
number, or lower case — `HWC00003`, `00003` and `hwc00003` all find the same
client.

## Changing a client's status

Status is the one field on a client that moves on its own schedule — a name or
an address is corrected once, a status follows the relationship. Routing that
through the edit form cost five clicks and two page loads for a single word, so
the badge on the client's page is the control: press it, choose, done.

It has its own server action rather than going through `updateClient`, which
re-validates the whole record and rewrites the contact rows. That is a lot of
machinery for one field, and it means a client whose contacts happen to fail
validation can still have their status moved.

The badge keeps its own colours as the trigger, so the row reads the same
whether or not it can be changed, and the button names both the current status
and what pressing it does — a bare badge reads as decoration to a screen reader.
The Clients list stays read-only.

## Finances

Every figure on the dashboard is derived from Projects, Payments, Clients and
Samplings — nothing on that page is stored or typed in. The arithmetic lives in
[`aggregate.ts`](src/lib/finances/aggregate.ts) as pure functions over plain
rows, with `today` passed in rather than read from the clock, so all 34 of its
tests run offline and deterministically. The page is only a rendering of what
they return.

Four definitions worth stating, because the spec was ambiguous:

- **Outstanding** is commission owed less payments received — *not* order value
  less payments, which would claim ₹50,00,000 was due on a ₹1,00,000 commission.
- **Commission at risk** is the slice of that outstanding on orders **not yet
  delivered**: the goods have not landed, so the commission is not firmly owed.
- **Retainers received** is the fees actually logged in the range, with the
  monthly rate across active clients beside it for context. Only the first is
  income.
- **Net earned** is commission earned, plus retainer fees received, less
  expenses.
  Expenses never touch outstanding: what a client owes is unaffected by what it
  cost to serve them, so a spend reduces earnings and leaves receivables alone.

The **passbook** is the page's ledger — every entry in the range oldest first,
commission and retainer fees received in, expenses out, with the balance after
each. Every row is money that actually moved: commission *earned* on an order
that has not paid is not an entry, and neither is a retainer nobody has sent.
Both stay on the cards above, which is what makes the closing balance mean
something.

Only expenses are editable there. Commission belongs to an order and is
corrected on its page, where the balance it settles is visible; a retainer row
is not a record at all but a month derived from the schedule, so it changes by
starting or stopping the retainer on its client.

**Deleting never removes an entry from the ledger.** Money that moved stays
recorded regardless of what happened afterwards to the order or client it
belonged to — deleting a project takes it out of the live business (its value,
its commission, its receivables) while the cash it took in and the costs it ran
up stay in the passbook. The order is still named on those rows, just no longer
linked, because there is no page left to open. Deleting a client works the same
way: it closes any running retainer, which stops further months falling due,
and leaves the months already charged where they are.

Two different dates are in play, deliberately: order value and commission are
bucketed by `orderDate`, cash received by `paidOn` — a payment in March against
a January order is March's cash. Outstanding ignores the range entirely and
counts every payment ever made, because it is a balance as of now.

## Expenses and retainers

Money the agent spent, recorded either against an order — courier, samples, a
factory visit, on the project's own page — or with no order behind it at all,
added from the passbook. A standalone expense can still name the **client** it
was for: a sample posted to a prospect or a trip to visit someone who has not
ordered yet was spent for somebody, even with no order to hang it on. Both
kinds are one `Expense` model, and `projectId` and `clientId` are independent —
an expense may have both, either or neither.

**Retainers** are the other half, and they are deliberately manual.
`Client.fixedMonthly` is the rate a client is charged; a `RetainerReceipt` is
one fee actually arriving, logged with a button on that client's page. There is
no schedule and nothing accrues: only the agent knows whether a client has
paid, and a schedule that assumed they had would put money in the ledger nobody
had sent. The amount is captured when the fee is logged, so changing a client's
rate later never rewrites what was already received.

The monthly rate still appears on the dashboard, beside the fees received, as
context — never counted as income.

An expense on a project inherits that project's currency, so it can never be
denominated differently from the commission it nets against — and a project
with expenses recorded refuses a currency change for the same reason payments
block one. Which project an expense belongs to is fixed at creation: moving a
spend between orders would rewrite two projects' net figures at once.

Net is allowed to go negative. An order that cost more to service than it
earned is exactly the thing worth seeing, so nothing floors at zero.

Currencies are never converted. The page shows one currency at a time,
defaulting to whichever has the most orders.

**Export CSV offers two files**, because they answer different questions and
cannot honestly be one:

- **Ledger** is the passbook row for row, with a running balance. It
  reconciles: the last balance in the file is the closing balance on screen,
  and the In and Out columns add up to the totals printed under the table.
  Deleted orders appear here, named but with nothing to follow.
- **Orders** is the business behind the figures — value, rate, commission,
  outstanding. Its `Received` column counts every payment ever made against an
  order and stops at the commission owed, so it deliberately does *not* tie to
  the passbook, which is a record of cash inside one date range.

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
sudo dnf install -y git        # or: sudo apt install -y git
git clone https://github.com/SandipanPaul/Hide-Weave.git ~/hide-weave
cd ~/hide-weave
bash scripts/deploy.sh your-hostname
```

Works on **Oracle Linux / RHEL** (dnf, firewalld, SELinux) and **Debian /
Ubuntu** (apt, ufw); it detects which and does the right thing. It installs
Node and Caddy if missing, writes `.env` (generating `SESSION_SECRET` and
prompting for the password), installs dependencies, creates an empty database,
builds, registers a systemd service, gets an HTTPS certificate, and opens the
firewall. Safe to run again — it never overwrites an existing `.env`.

### Sharing a server with something else

The script **refuses to start** if anything other than Caddy is already
serving on 80 or 443, and prints what it found. Quietly taking those ports
would take the other site down.

To put this app behind an nginx or Apache that is already there, add a block
pointing at `127.0.0.1:3000` yourself, then run with `SKIP_PROXY=1` to do
everything except the web server:

```bash
SKIP_PROXY=1 bash scripts/deploy.sh your-hostname
```

If Caddy is already running and has a `conf.d`, the script adds a site file
rather than rewriting the config in use.

On SELinux systems it sets `httpd_can_network_connect`, without which the
proxy is refused its own outbound connection to the app.

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

**What is actually scheduled** on the production box is a weekly run, in the
`opc` crontab, logging beside the snapshots:

```cron
0 3 * * 0 cd /opt/hide-weave && /usr/bin/npm run db:backup >> /opt/hide-weave/backups/backup.log 2>&1
```

Weekly plus a 14-snapshot retention is about three months of history, and means
up to a week of work sits between snapshots. Nothing yet copies them off the
machine, so this protects against a bad import or a wrong delete, not against
losing the VM.

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
- [x] **6.** Finances: tested aggregate functions, then the dashboard
- [x] **7.** Polish: empty states, error handling, accessibility

Added since:

- Multiple exporters per project, with a quantity split
- A `CHASING` client status, for names being pursued who have not ordered yet
- Expenses, on an order and off it, and the Finances passbook
- Retainer fees, logged by hand on the client and counted as income when they arrive

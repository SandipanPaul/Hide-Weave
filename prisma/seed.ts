/**
 * Seeds a realistic dataset so the dashboard has something to show on first
 * run: ~15 clients, ~10 suppliers, ~50 projects across every status, ~80
 * payments, and samplings spread across past and future.
 *
 * Deterministic: the PRNG is seeded with a constant, so re-running produces the
 * same numbers and the dashboard is stable between runs. Dates are relative to
 * today, so the "last 12 months" default range always has data in it.
 *
 * Run with: npm run db:seed   (wipes and repopulates)
 */
import { ORDER_CODES } from "../src/lib/codes";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { addDaysUtc, todayUtc } from "../src/lib/dates";
import { computeCommission } from "../src/lib/money";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

/** Small deterministic PRNG (mulberry32) — no dependency, reproducible output. */
function makeRandom(seed: number) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260819);

const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const randomInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;

const TODAY = todayUtc();

const CLIENTS = [
  ["Meridian Foods Ltd", "London, United Kingdom", "GBP", "GB"],
  ["Al Noor Trading LLC", "Deira, Dubai, United Arab Emirates", "AED", "AE"],
  ["Sakura Import Co", "Yokohama, Japan", "USD", "JP"],
  ["Baltic Provisions OÜ", "Tallinn, Estonia", "EUR", "EE"],
  ["Cape Verde Spices", "Praia, Cabo Verde", "EUR", "CV"],
  ["Nordwind Handel GmbH", "Hamburg, Germany", "EUR", "DE"],
  ["Sunrise Agro Imports", "Nairobi, Kenya", "USD", "KE"],
  ["Prairie Grain Partners", "Winnipeg, Canada", "USD", "CA"],
  ["Bosphorus Ticaret A.S.", "Istanbul, Türkiye", "EUR", "TR"],
  ["Golden Coast Distributors", "Singapore", "SGD", "SG"],
  ["Rajdhani Wholesale", "Karol Bagh, New Delhi", "INR", "IN"],
  ["Konkan Marine Exports", "Mangalore, Karnataka", "INR", "IN"],
  ["Highland Tea Buyers", "Edinburgh, United Kingdom", "GBP", "GB"],
  ["Andes Fresh SAC", "Lima, Peru", "USD", "PE"],
  ["Levant Food Group", "Amman, Jordan", "USD", "JO"],
] as const;

const SUPPLIERS = [
  ["Sattva Agro Exports Pvt Ltd", "https://sattvaagro.example.com", "Ramesh Iyer", "Kochi, Kerala"],
  ["Deccan Spice Mills", "https://deccanspice.example.com", "Priya Nair", "Guntur, Andhra Pradesh"],
  ["Bharat Textiles & Weaves", "https://bharatweaves.example.com", "Anil Kumar", "Tiruppur, Tamil Nadu"],
  ["Coromandel Seafoods", "https://coromandelseafoods.example.com", "Suresh Reddy", "Visakhapatnam, Andhra Pradesh"],
  ["Himalaya Organics", "https://himalayaorganics.example.com", "Tenzin Sharma", "Dehradun, Uttarakhand"],
  ["Kutch Salt & Minerals", null, "Bhavesh Patel", "Bhuj, Gujarat"],
  ["Malabar Coir Works", "https://malabarcoir.example.com", "Fathima Rasheed", "Alappuzha, Kerala"],
  ["Punjab Grain Traders", null, "Harpreet Singh", "Ludhiana, Punjab"],
  ["Nilgiri Tea Estates", "https://nilgiritea.example.com", "Meera Krishnan", "Coonoor, Tamil Nadu"],
  ["Rajasthan Handicraft House", "https://rajhandicraft.example.com", "Vikram Rathore", "Jodhpur, Rajasthan"],
] as const;

const PRODUCTS = [
  ["Basmati rice", "MT"],
  ["Turmeric fingers", "MT"],
  ["Black pepper", "kg"],
  ["Cardamom", "kg"],
  ["Frozen shrimp", "MT"],
  ["Cotton bed linen", "pcs"],
  ["Coir mats", "pcs"],
  ["Orthodox tea", "kg"],
  ["Industrial salt", "MT"],
  ["Brass handicrafts", "pcs"],
  ["Cashew kernels", "MT"],
  ["Sesame seeds", "MT"],
] as const;

const PROJECT_STATUSES = [
  "QUOTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "SHIPPED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
] as const;

const PAYMENT_METHODS = ["Bank transfer", "UPI", "Cheque", "Wire transfer", "Cash"] as const;

/**
 * The seed wipes the database before repopulating it. Running it against
 * production would delete the real records and replace them with invented
 * ones, so it refuses unless the database is obviously a development one.
 *
 * Set ALLOW_SEED=1 to override, which you should only ever want on a machine
 * you are happy to lose.
 */
function refuseToSeedProduction() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const looksLikeDev = /dev\.db|test\.db|:memory:/.test(url);
  if (looksLikeDev || process.env.ALLOW_SEED === "1") return;

  throw new Error(
    `Refusing to seed ${url}: this does not look like a development database, ` +
      `and seeding deletes everything first. Set ALLOW_SEED=1 if you really mean it.`,
  );
}

async function main() {
  refuseToSeedProduction();
  console.log("Clearing existing data…");
  // Order matters: children before parents.
  await prisma.payment.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.clientSampling.deleteMany();
  await prisma.project.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.client.deleteMany();

  console.log("Seeding clients…");
  const clients = [];
  for (const [index, [name, address, currency, country]] of CLIENTS.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    // Every client has a phone or an email — most have both.
    const hasEmail = index % 7 !== 3;
    const hasPhone = index % 5 !== 2 || !hasEmail;
    clients.push(
      await prisma.client.create({
        data: {
          name,
          address,
          country,
          currency,
          // Some clients are reachable at more than one number or address —
          // the common shape in a real client list.
          contacts: {
            create: [
              ...(hasPhone
                ? [
                    {
                      kind: "PHONE",
                      value: `+${randomInt(1, 91)} ${randomInt(20, 99)} ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
                      position: 0,
                    },
                    ...(index % 4 === 1
                      ? [
                          {
                            kind: "PHONE",
                            value: `+${randomInt(1, 91)} ${randomInt(20, 99)} ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`,
                            position: 1,
                          },
                        ]
                      : []),
                  ]
                : []),
              ...(hasEmail
                ? [
                    {
                      kind: "EMAIL",
                      value: `orders@${slug.slice(0, 18)}.example.com`,
                      position: 0,
                    },
                    ...(index % 3 === 0
                      ? [
                          {
                            kind: "EMAIL",
                            value: `accounts@${slug.slice(0, 18)}.example.com`,
                            position: 1,
                          },
                        ]
                      : []),
                  ]
                : []),
            ],
          },
          website: chance(0.6) ? `https://${slug.slice(0, 18)}.example.com` : null,
          contactPerson: pick([
            "Daniel Okoro", "Yuki Tanaka", "Maria Santos", "Ahmed Hassan", "Lena Fischer",
            "Grace Mwangi", "Tom Whitfield", "Ines Duarte", "Omar Khalid", "Sofia Rossi",
          ]),
          status: index % 8 === 5 ? "INACTIVE" : "ACTIVE",
          // Roughly a third of clients are on a monthly retainer.
          fixedMonthly: index % 3 === 0 ? BigInt(randomInt(15, 60) * 100 * 100) : null,
          notes: chance(0.3) ? "Prefers consolidated monthly invoicing." : null,
        },
      }),
    );
  }

  console.log("Seeding suppliers…");
  const suppliers: Array<{ id: string; companyName: string }> = [];
  for (const [companyName, website, contactPerson, address] of SUPPLIERS) {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "");
    suppliers.push(
      await prisma.supplier.create({
        data: {
          companyName,
          website,
          contactPerson,
          address,
          email: chance(0.85) ? `contact@${slug.slice(0, 20)}.example.com` : null,
          phone: chance(0.9) ? `+91 ${randomInt(70, 99)}${randomInt(100, 999)} ${randomInt(10000, 99999)}` : null,
          sourceUrl: website && chance(0.4) ? website : null,
        },
      }),
    );
  }

  console.log("Seeding projects…");
  const projects = [];
  for (let i = 0; i < 50; i++) {
    const client = pick(clients);
    const supplier = chance(0.85) ? pick(suppliers) : null;
    const [product, unit] = pick(PRODUCTS);
    const status = pick(PROJECT_STATUSES);

    // Spread orders across the past 14 months so the default 12-month window is
    // full and there is a little history just outside it.
    const orderDate = addDaysUtc(TODAY, -randomInt(0, 425));
    const leadTimeDays = randomInt(20, 90);
    const expectedDelivery = addDaysUtc(orderDate, leadTimeDays);

    // Some delivered orders land late, some early; a few shipped orders are
    // already past their expected date — those drive the "overdue" tables.
    const delivered = status === "DELIVERED" || status === "CLOSED";
    const actualDelivery = delivered
      ? addDaysUtc(expectedDelivery, randomInt(-8, 25))
      : null;

    // Order values span three orders of magnitude, including a few large
    // consignments that would overflow a 32-bit integer in minor units.
    const magnitude = chance(0.12) ? randomInt(300, 900) : randomInt(4, 120);
    const orderValue = BigInt(magnitude) * 100_000n * 100n; // lakhs -> minor units

    const quantity = randomInt(5, 4000);

    /**
     * Most orders go to one supplier; some are split across two or three, the
     * way a large run gets shared out. A split never adds up to more than the
     * order, and sometimes adds up to less — work not yet placed.
     */
    const makers = supplier
      ? chance(0.3)
        ? [supplier, ...Array.from({ length: randomInt(1, 2) }, () => pick(suppliers))]
            .filter((maker, index, all) => all.findIndex((m) => m.id === maker.id) === index)
        : [supplier]
      : [];

    const allocations = makers.map((maker, position) => ({
      supplierId: maker.id,
      position,
      // Split the quantity into roughly even parts, with the last taking the
      // remainder so the arithmetic always lands exactly.
      quantity:
        position === makers.length - 1
          ? quantity - Math.floor(quantity / makers.length) * (makers.length - 1)
          : Math.floor(quantity / makers.length),
    }));

    projects.push(
      await prisma.project.create({
        data: {
          clientId: client.id,
          suppliers: { create: allocations },
          product,
          unit,
          orderId: ORDER_CODES.format(2500 + i),
          quantity,
          orderValue,
          commissionPercentage: Number((randomInt(75, 450) / 100).toFixed(2)),
          currency: client.currency,
          status,
          orderDate,
          expectedDelivery,
          actualDelivery,
          notes: chance(0.25) ? "Buyer requested pre-shipment inspection." : null,
        },
      }),
    );
  }

  console.log("Seeding payments…");
  // Payments settle the agent's commission, never the order value. Each project
  // is paid in full, in part, or not at all — and never more than the
  // commission it earned.
  let paymentCount = 0;
  const payable = projects.filter((p) => p.status !== "CANCELLED" && p.status !== "QUOTED");
  for (const project of payable) {
    if (paymentCount >= 80) break;

    const commission = computeCommission(project.orderValue, project.commissionPercentage);
    if (commission <= 0n) continue;

    // Delivered and closed work is mostly paid; work in flight mostly is not.
    const settled = project.status === "DELIVERED" || project.status === "CLOSED";
    const coverage = settled
      ? pick([1, 1, 1, 0.6, 0.35])
      : pick([0, 0.5, 0.25, 0.75]);
    if (coverage === 0) continue;

    const instalments = coverage === 1 ? randomInt(2, 4) : randomInt(1, 3);
    const totalToPay = (commission * BigInt(Math.round(coverage * 100))) / 100n;

    let paid = 0n;
    for (let n = 0; n < instalments && paymentCount < 80; n++) {
      const last = n === instalments - 1;
      // Split unevenly, and make the final instalment absorb the remainder so
      // the parts sum exactly — no rounding drift.
      const amount = last ? totalToPay - paid : totalToPay / BigInt(instalments);
      if (amount <= 0n) continue;

      const base = project.actualDelivery ?? project.expectedDelivery ?? project.orderDate;
      const paidOn = addDaysUtc(base, randomInt(3, 45) + n * randomInt(15, 40));

      await prisma.payment.create({
        data: {
          projectId: project.id,
          amount,
          // Never record a payment in the future.
          paidOn: paidOn > TODAY ? TODAY : paidOn,
          method: pick(PAYMENT_METHODS),
        },
      });
      paid += amount;
      paymentCount++;
    }
  }

  console.log("Seeding samplings…");
  let samplingCount = 0;
  for (const client of clients) {
    const count = randomInt(0, 5);
    for (let i = 0; i < count; i++) {
      // Mix of past (mostly completed or cancelled) and upcoming (scheduled),
      // with enough inside the next 30 days to fill the dashboard table.
      const upcoming = chance(0.45);
      const scheduledDate = upcoming
        ? addDaysUtc(TODAY, randomInt(1, 75))
        : addDaysUtc(TODAY, -randomInt(1, 300));
      const status = upcoming ? "SCHEDULED" : chance(0.75) ? "COMPLETED" : "CANCELLED";

      await prisma.clientSampling.create({
        data: {
          clientId: client.id,
          scheduledDate,
          status,
          product: chance(0.8) ? pick(PRODUCTS)[0] : null,
          notes: chance(0.25) ? "Courier samples in the week before." : null,
        },
      });
      samplingCount++;
    }
  }

  console.log(
    `\nDone: ${clients.length} clients, ${suppliers.length} suppliers, ` +
      `${projects.length} projects, ${paymentCount} payments, ${samplingCount} samplings.`,
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

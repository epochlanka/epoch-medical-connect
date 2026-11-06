// One-time (and safe to re-run) production setup. Runs inside the production image with only its
// production dependencies — no tsx, no dev tooling:
//
//   ./start-clinic.sh admin          (from the clinic install folder; prompts for the password)
//
// which runs, inside the application container:
//   docker compose exec -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='<12+ chars>' \
//     epoch-medical node scripts/bootstrap-production.js
//
// It exists because production deliberately never runs the demo seed, so a fresh database has no
// users, no payment methods (every payment is rejected until at least one method exists) and no
// dosage forms (the doctor's "Add External Medicine" Dosage Form list is empty without them).
//
//  - Admin: created only when ADMIN_PASSWORD is provided. Refuses to overwrite an existing username.
//  - Payment methods: the standard set is added ONLY when the clinic has no active payment method at
//    all. If you have already configured your own, nothing is touched. Adjust them any time under
//    Settings > Payment Methods.
//  - Dosage forms: the same rule — the standard list is added only when there is no active one.
//    Adjust them under Settings > Master Data.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const DEFAULT_PAYMENT_METHODS = ['Cash', 'Card', 'Mobile', 'Bank Transfer', 'Other'];
const DEFAULT_DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Cream', 'Ointment', 'Gel', 'Drops',
  'Eye Drops', 'Ear Drops', 'Injection', 'Inhaler', 'Sachet', 'Powder', 'Other',
];
const MIN_PASSWORD_LENGTH = 12;

async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    const admins = await prisma.user.count({ where: { role: 'Admin', is_active: true } });
    console.log(admins > 0 ? `Admin: ${admins} active administrator(s) already exist — nothing to do.` : 'Admin: NO administrator exists yet. Re-run with ADMIN_PASSWORD set to create one.');
    return admins > 0;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Admin: ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    return false;
  }
  if (await prisma.user.findUnique({ where: { username } })) {
    console.error(`Admin: user "${username}" already exists — refusing to overwrite. Change the password from the app instead.`);
    return false;
  }
  const admin = await prisma.user.create({ data: { username, password_hash: await bcrypt.hash(password, 10), role: 'Admin' } });
  console.log(`Admin: created "${admin.username}" (user_id ${admin.user_id}).`);
  return true;
}

// Adds a standard list only when the clinic has no active entry of that type, so a list the clinic
// has already set up for itself is never changed.
async function ensureDefaults(type, label, values) {
  const active = await prisma.masterDataItem.count({ where: { type, is_active: true } });
  if (active > 0) {
    console.log(`${label}: ${active} active entr${active === 1 ? 'y' : 'ies'} already configured — left untouched.`);
    return;
  }
  for (const [i, value] of values.entries()) {
    await prisma.masterDataItem.upsert({
      where: { type_value: { type, value } },
      update: { is_active: true },
      create: { type, value, sort_order: i + 1 },
    });
  }
  console.log(`${label}: added ${values.join(', ')}.`);
}

async function main() {
  const adminOk = await ensureAdmin();
  await ensureDefaults('PaymentMethod', 'Payment methods', DEFAULT_PAYMENT_METHODS);
  await ensureDefaults('DosageForm', 'Dosage forms', DEFAULT_DOSAGE_FORMS);
  if (!adminOk) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

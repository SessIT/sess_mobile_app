// Holidays with branches: a row with branchId NULL applies to everyone, a row
// with a branchId only to that branch (state / local holidays). Every place
// that asks "is this day a holiday?" goes through here so branches stay right.
const prisma = require('./prisma');

const dateOnly = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d) => new Date(d).toISOString().slice(0, 10);

// One query for a date range → (branchId) => Map('YYYY-MM-DD' → name).
// Company-wide days plus that branch's own (a branch row wins on name).
async function holidaysByBranch(startYmd, endYmd = startYmd) {
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: dateOnly(startYmd), lte: dateOnly(endYmd) } },
    select: { date: true, name: true, branchId: true },
  });
  const global = new Map();
  const per = new Map();
  for (const r of rows) {
    if (r.branchId == null) global.set(ymdOf(r.date), r.name);
    else {
      if (!per.has(r.branchId)) per.set(r.branchId, new Map());
      per.get(r.branchId).set(ymdOf(r.date), r.name);
    }
  }
  const cache = new Map();
  return (branchId) => {
    if (!branchId) return global;
    if (!cache.has(branchId)) cache.set(branchId, new Map([...global, ...(per.get(branchId) || [])]));
    return cache.get(branchId);
  };
}

const holidayMapFor = async (startYmd, endYmd, branchId) => (await holidaysByBranch(startYmd, endYmd))(branchId);

async function branchOfUser(userId) {
  const u = await prisma.user.findUnique({ where: { id: Number(userId) }, select: { branchId: true } });
  return u?.branchId || null;
}

// The holiday on a day for a branch (company-wide or that branch), or null.
const holidayOn = (ymd, branchId) => prisma.holiday.findFirst({
  where: { date: dateOnly(ymd), OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] },
  orderBy: { branchId: 'desc' }, // a branch-specific row first
});

module.exports = { holidaysByBranch, holidayMapFor, branchOfUser, holidayOn };

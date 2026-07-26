const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://pranjaltripathi_db_user:frbHDwcWM1MG7PYY@flashfire-website-clust.pdybl4h.mongodb.net/test?retryWrites=true&w=majority&appName=flashfire-website-cluster';

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  const from = new Date('2026-07-01');
  const to = new Date('2026-07-31T23:59:59.999Z');

  const byStatus = await db.collection('campaignbookings').aggregate([
    { $match: { bookingCreatedAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$bookingStatus', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();

  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const paid = byStatus.find(r => r._id === 'paid');

  console.log('=== July 2026 Leads ===');
  console.log('Total leads:', total);
  console.log('Paid leads:', paid ? paid.count : 0);
  console.log('\nBreakdown by status:');
  byStatus.forEach(r => console.log(' ', r._id, ':', r.count));

  await client.close();
}

main().catch(console.error);

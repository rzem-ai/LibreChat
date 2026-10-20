/* eslint-disable no-undef, react-hooks/rules-of-hooks -- mongosh script: `use` and `db` are shell globals */
// The current database to use.
use('mdb-librechat-database-prd');
const fs = require('fs');
const my_username = 'afulton'; // Replace with your username

// Group messages first so only one scalar count per user is held in memory.
// messages.user is stored as a string, users._id is an ObjectId — match on the string form.
const messageCounts = new Map(
  db.messages
    .aggregate([{ $group: { _id: '$user', count: { $sum: 1 } } }], { allowDiskUse: true })
    .toArray()
    .map(({ _id, count }) => [_id, count]),
);

const results = db.users
  .find({}, { name: 1, email: 1, termsAcceptedAt: 1, 'tutorialRatings.getting-started-guide': 1 })
  .toArray()
  .map((user) => ({
    name: user.name,
    email: user.email,
    termsAcceptedAt: user.termsAcceptedAt,
    numberOfMessages: messageCounts.get(user._id.toString()) ?? 0,
    tutorialRating: user.tutorialRatings?.['getting-started-guide'] ?? false,
  }))
  .sort((a, b) => b.numberOfMessages - a.numberOfMessages);

// Escape a value for CSV output (wrap in quotes if it contains a comma, quote, or newline).
function toCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const columns = ['name', 'email', 'termsAcceptedAt', 'numberOfMessages', 'tutorialRating'];
const csvLines = [columns.join(',')];
for (const row of results) {
  csvLines.push(columns.map((col) => toCsvField(row[col])).join(','));
}
const csv = csvLines.join('\n');

const outputPath = `/Users/${my_username}/messages-per-user.csv`;
fs.writeFileSync(outputPath, csv);
console.log(`Wrote ${results.length} rows to ${outputPath}`);

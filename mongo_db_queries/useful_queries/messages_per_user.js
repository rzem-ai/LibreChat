
// The current database to use.
use("mdb-librechat-database-prd");
const fs = require('fs');
const my_username = "afulton"; // Replace with your username


const results = db.users.aggregate([
  {
    // messages.user is stored as a string, users._id is an ObjectId — convert to match
    $lookup: {
      from: "messages",
      let: { userId: { $toString: "$_id" } },
      pipeline: [
        { $match: { $expr: { $eq: ["$user", "$$userId"] } } },
        { $project: { _id: 1 } }
      ],
      as: "userMessages"
    }
  },
  {
    $project: {
      _id: 0,
      name: 1,
      email: 1,
      termsAcceptedAt: 1,
      numberOfMessages: { $size: "$userMessages" },
      tutorialRating: { $ifNull: ["$tutorialRatings.getting-started-guide", false] }
    }
  },
  { $sort: { numberOfMessages: -1 } }
]).toArray();

// Escape a value for CSV output (wrap in quotes if it contains a comma, quote, or newline).
function toCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const columns = ["name", "email", "termsAcceptedAt", "numberOfMessages", "tutorialRating"];
const csvLines = [columns.join(",")];
for (const row of results) {
  csvLines.push(columns.map((col) => toCsvField(row[col])).join(","));
}
const csv = csvLines.join("\n");

const outputPath = `/Users/${my_username}/messages-per-user.csv`;
fs.writeFileSync(outputPath, csv);
console.log(`Wrote ${results.length} rows to ${outputPath}`);
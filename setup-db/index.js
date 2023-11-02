const { MongoClient } = require("mongodb");
require("dotenv").config();

async function updateStats(client) {
  console.log("Running iteration");
  console.log("Attempting to connect to db");
  await client.connect();
  console.log("Connected.");
  const db = client.db(process.env.MONGODB_DB_NAME);
  const players = db.collection(process.env.MONGODB_DB_TABLE_NAME_PLAYERS);
  const stats = db.collection(process.env.MONGODB_DB_TABLE_NAME_STATS);

  const nOfPlayersTotal = await players.estimatedDocumentCount();
  const nOfPlayersAlive = await players.countDocuments({ alive: true });

  const nOfPlayersFromEachGradeObj = await players
    .aggregate([
      {
        $group: {
          _id: { $toLower: "$grade" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          counts: {
            $push: { k: "$_id", v: "$count" },
          },
        },
      },
      {
        $replaceRoot: {
          newRoot: { $arrayToObject: "$counts" },
        },
      },
    ])
    .toArray();

  var nOfPlayersFromEachGrade = [];
  if (nOfPlayersFromEachGradeObj[0]) {
    for (const [key, value] of Object.entries(nOfPlayersFromEachGradeObj[0])) {
      nOfPlayersFromEachGrade.push({
        grade: key,
        nOfPlayers: value,
      });
    }
  }

  // TODO: Aggregate killstats
  const top10ByKills = null;
  const top10ByKillTime = null;

  console.log(nOfPlayersTotal);
  console.log(nOfPlayersFromEachGrade);

  await stats.updateOne(
    {},
    {
      $set: {
        nOfPlayers: {
          total: nOfPlayersTotal,
          dead: nOfPlayersTotal - nOfPlayersAlive,
          alive: nOfPlayersAlive,
        },
        nOfPlayersFromEachGrade,
        top10ByKills,
        top10ByKillTime,
      },
    },
    { upsert: true }
  );
  await client.close();
}

async function main() {
  const uri = `mongodb://${process.env.MONGODB_ADMIN}:${process.env.MONGODB_ADMIN_PWD}@mongodb`;

  const client = new MongoClient(uri);

  try {
    updateStats(client);
    setInterval(function () {
      updateStats(client);
    }, 60 * 1000);
  } catch (error) {
    console.log("Ran into an error when running stats loop:");
    console.error(e);
  }
}

main().catch(console.error);

const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
require("dotenv").config();

async function addAdmin(client) {
  const db = client.db(process.env.MONGODB_DB_NAME);
  const admins = db.collection(process.env.MONGODB_DB_TABLE_NAME_ADMINS);
  const salt = await bcrypt.genSalt();
  await admins.insertOne({
    username: process.env.KILLERGAME_ADMIN,
    pwdSalt: salt,
    pwd: await bcrypt.hash(process.env.KILLERGAME_ADMIN_PWD, salt),
    creationTime: new Date().getTime(),
  });
}

async function addDefaultSettings(client) {
  const db = client.db(process.env.MONGODB_DB_NAME);
  const game = db.collection(process.env.MONGODB_DB_TABLE_NAME_GAME);
  await game.insertOne({
    type: "settings",
    isPaused: true,
    signupIsClosed: false,
  });
}

async function updateStats(client) {
  console.log("** Running iteration **");
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
        grade: key.toUpperCase(),
        nOfPlayers: value,
      });
    }
  }

  const top10ByKills = await players
    .aggregate([
      { $match: { kills: { $gt: 0 } } },
      { $sort: { kills: -1 } },
      { $project: { name: 1, grade: 1, kills: 1, _id: 0 } },
      { $limit: 10 },
    ])
    .toArray();
  const top10ByKillTime = await players
    .aggregate([
      { $match: { fastestKill: { $lt: Number.MAX_SAFE_INTEGER } } },
      { $sort: { fastestKill: 1 } },
      { $project: { name: 1, grade: 1, fastestKill: 1, _id: 0 } },
      { $limit: 10 },
    ])
    .toArray();

  console.log(`We currently have ${nOfPlayersTotal} signed up players`);

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
  console.log("Stats updated");
}

async function main() {
  const uri = `mongodb://${process.env.MONGODB_ADMIN}:${process.env.MONGODB_ADMIN_PWD}@mongodb`;
  const client = new MongoClient(uri);

  console.log("Adding admin user...");
  await addAdmin(client);
  console.log("Admin user successfully added\n");

  console.log("Setting default game settings...");
  await addDefaultSettings(client);
  console.log("Default settings added");

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

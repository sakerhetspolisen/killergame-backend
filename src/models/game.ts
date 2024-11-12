import { Collection, Document } from "mongodb";
import IDBGameData from "../interfaces/game.interface";

export default class Game {
  db: Collection<Document>;

  constructor(db: Collection<Document>) {
    this.db = db;
  }

  async getSettings() {
    const { isPaused, killValue, signupIsClosed } =
      (await this.db.findOne<IDBGameData>(
        { type: "settings" },
        { projection: { isPaused: 1, killValue: 1, signupIsClosed: 1, _id: 0 } }
      )) ?? {};

    // Return null if any required value is undefined
    if (
      isPaused === undefined ||
      killValue === undefined ||
      signupIsClosed === undefined
    ) {
      return {
        isPaused: true,
        killValue: 0,
        signupIsClosed: true,
      };
    }

    return {
      isPaused,
      killValue,
      signupIsClosed,
    };
  }
}

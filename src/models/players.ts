import { Collection, Document } from "mongodb";
import { IDBPlayer, TargetPlayer } from "../interfaces/player.interface";
import shuffleArray from "../utils/shuffleArray";

export default class Players {
  db: Collection<Document>;

  constructor(db: Collection<Document>) {
    this.db = db;
  }

  async #getPlayer<K extends keyof IDBPlayer>(
    query: Object,
    include: (keyof IDBPlayer)[],
    exclude: (keyof IDBPlayer)[]
  ) {
    return await this.db.findOne<Pick<IDBPlayer, K>>(query, {
      projection: {
        ...Object.fromEntries(include.map((key) => [key, 1])),
        ...Object.fromEntries(exclude.map((key) => [key, 0])),
      },
    });
  }

  async #getPlayers<K extends keyof IDBPlayer>(
    query: Object,
    include: (keyof IDBPlayer)[],
    exclude: (keyof IDBPlayer)[]
  ) {
    return await this.db
      .find<Pick<IDBPlayer, K>>(query, {
        projection: {
          ...Object.fromEntries(include.map((key) => [key, 1])),
          ...Object.fromEntries(exclude.map((key) => [key, 0])),
        },
      })
      .toArray();
  }

  async getPlayerById<K extends keyof IDBPlayer>(
    id: string,
    include: (keyof IDBPlayer)[] = [],
    exclude: (keyof IDBPlayer)[] = ["_id"]
  ) {
    return this.#getPlayer<K>({ id }, include, exclude);
  }

  async getPlayerByEmail<K extends keyof IDBPlayer>(
    email: string,
    include: (keyof IDBPlayer)[] = [],
    exclude: (keyof IDBPlayer)[] = ["_id"]
  ) {
    return this.#getPlayer<K>({ email }, include, exclude);
  }

  async getAllPlayersAlive<K extends keyof IDBPlayer>(
    include: (keyof IDBPlayer)[] = [],
    exclude: (keyof IDBPlayer)[] = ["_id"]
  ) {
    return await this.#getPlayers<K>({ alive: true }, include, exclude);
  }

  async getAllPlayers<K extends keyof IDBPlayer>(
    include: (keyof IDBPlayer)[] = [],
    exclude: (keyof IDBPlayer)[] = ["_id"]
  ) {
    return await this.#getPlayers<K>({}, include, exclude);
  }

  async perDeletePlayerById(id: string) {
    await this.db.deleteOne({ id });
  }

  async perDeletePlayerByEmail(email: string) {
    await this.db.deleteOne({ email });
  }

  async randomizeAllTargets() {
    const players = await this.getAllPlayersAlive<
      "_id" | "id" | "name" | "grade"
    >(["_id", "id", "name", "grade"], []);
    const playersShuffled = shuffleArray(players);
    const playersWithTarget: (Pick<
      IDBPlayer,
      "_id" | "id" | "name" | "grade"
    > & { target: Pick<IDBPlayer, "_id" | "id" | "name" | "grade"> | null })[] =
      playersShuffled.map((p) => ({
        ...p,
        target: null,
      }));
    const l = playersWithTarget.length;

    // Set the new target as the preceding player in the shuffled array
    // of players. The target of the first player in the array is set to
    // be the last player
    for (let i = 1; i <= l; i++) {
      const { target, ...newTargetObj } = playersWithTarget[i - (1 % l)];
      playersWithTarget[i % l].target = newTargetObj;
    }

    // Update all players
    for (let { _id, target } of playersWithTarget) {
      await this.db.updateOne(
        { _id },
        {
          $set: {
            target,
            isTarget: true,
          },
        }
      );
    }
  }

  async eliminateTargetAndGetNextTarget(
    id: string,
    targetID: string
  ): Promise<TargetPlayer | null> {
    const target = (await this.getPlayerById(targetID))?.target ?? null;
    await this.db.updateOne(
      { id: targetID },
      {
        $set: {
          target: null,
          alive: false,
          killedBy: id,
          isTarget: false,
        },
      }
    );
    return target;
  }

  async registerKillAndSetNewTarget(
    id: string,
    newTarget: TargetPlayer,
    latestKillTime: number,
    killValue: number = 1
  ) {
    const currentTime = new Date().getTime();
    const killTime = currentTime - latestKillTime;
    await this.db.updateOne(
      { id },
      {
        $set: {
          target: newTarget,
          latestKillTime: currentTime,
        },
        $min: {
          fastestKill: killTime,
        },
        $inc: { kills: killValue },
      }
    );
  }
}

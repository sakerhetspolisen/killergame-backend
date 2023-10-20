import { ObjectId } from "@fastify/mongodb";

export type PlayerID = number;

export interface IPlayer {
  name: string;
  grade: string;
  id: PlayerID;
  email: string;
  kills: number;
  fastestKill: number;
}

export interface IDBPlayer extends IPlayer {
  _id: ObjectId;
  creationTime: Date;
  latestKillTime: Date;
  target: Pick<IPlayer, "id" | "grade" | "name">;
  alive: boolean;
}

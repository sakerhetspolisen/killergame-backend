import { ObjectId } from "@fastify/mongodb";

export type PlayerID = string;

export interface IPlayer {
  name: string;
  grade: string;
  id: PlayerID;
  email: string;
  kills: number;
  fastestKill: number;
}

export type TargetPlayer = Pick<IPlayer, "id" | "grade" | "name"> & {
  _id: ObjectId;
};

export interface IDBPlayer extends IPlayer {
  _id: ObjectId;
  creationTime: number;
  latestKillTime: number;
  target: TargetPlayer;
  alive: boolean;
  killedBy: string;
  isTarget: boolean;
}

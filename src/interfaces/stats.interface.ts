import { IPlayer } from "./player.interface";

export interface IDBStats {
  nOfPlayers: {
    total: number;
    dead: number;
    alive: number;
  };
  nOfPlayersFromEachGrade: Array<{
    grade: string;
    nOfPlayers: number;
  }>;
  top10ByKills: Array<Pick<IPlayer, "name" | "grade" | "kills">>;
  top10ByKillTime: Array<Pick<IPlayer, "name" | "grade" | "fastestKill">>;
}

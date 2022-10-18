export interface IPlayer {
  firstName: string;
  lastName: string;
  email: string;
  grade: string;
}
export interface IServerPlayer extends IPlayer {
  id: string;
  fastestKill?: number;
  targetId?: string;
  token: string;
  latestKillTime: number;
}

export interface FastestKillObj {
  fastestKill: number;
}

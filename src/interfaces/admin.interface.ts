import { ObjectId } from "@fastify/mongodb";

export interface IAdmin {
  username: string;
  password: string;
}

export interface IDBAdmin extends Omit<IAdmin, "password"> {
  salt: string;
  pwdHash: string;
  creationTime: Date;
  _id: ObjectId;
}

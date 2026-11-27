import { MongoClient } from "mongodb";

const uri = process.env.CLIENTS_TRACKING_MONGODB_URI!;
let client: MongoClient;

export async function getDashDb() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db();
}

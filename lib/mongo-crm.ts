import { MongoClient } from "mongodb";

const uri = process.env.SALES_MONGO_URI!;
let client: MongoClient;

export async function getCrmDb() {
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
  }
  return client.db("test");
}

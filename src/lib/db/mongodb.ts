import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

interface GlobalWithMongoose {
  mongoose?: MongooseCache;
}

// Global cache so we reuse a single connection across hot reloads (dev) and
// warm serverless invocations (prod) instead of opening a new pool each time.
// NOTE: the cache object MUST be written back to `global` — otherwise dev hot
// reloads re-create the connection on every save and leak connections on M0.
const globalForMongoose = global as GlobalWithMongoose;
const cached: MongooseCache =
  globalForMongoose.mongoose ?? { conn: null, promise: null };
globalForMongoose.mongoose = cached;

export async function connectToDB() {
  if (!MONGODB_URI) {
    throw new Error("Please define the MONGODB_URI environment variable");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI, {
        bufferCommands: false,
        // Connection-pool hardening for MongoDB M0 (~500 connection ceiling).
        // Cap each process so even many warm serverless containers stay well
        // under the limit, and reap idle connections back to the cluster.
        maxPoolSize: 5,
        minPoolSize: 0,
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 8000,
      })
      .then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Allow a later call to retry instead of awaiting a permanently rejected
    // promise.
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}

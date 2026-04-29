import "server-only";
import mongoose from "mongoose";
import { env } from "@/lib/env";

const g = globalThis as unknown as {
  _mongoose?: Promise<typeof mongoose>;
};

export function connectMongo(): Promise<typeof mongoose> {
  if (!g._mongoose) {
    mongoose.set("strictQuery", true);
    g._mongoose = mongoose
      .connect(env.MONGODB_URI, {
        serverSelectionTimeoutMS: 5_000,
      })
      .catch((err) => {
        delete g._mongoose;
        throw err;
      });
  }
  return g._mongoose;
}

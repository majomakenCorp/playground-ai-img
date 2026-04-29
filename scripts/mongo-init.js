// Bootstrap the application database + an app-scoped user on first boot.
// Runs only when the mongo_data volume is empty (Mongo's init mechanism).
// Idempotent: re-running on an existing volume is a no-op because the
// volume is preserved and this script is not re-executed.

/* global db */

const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appUser || !appPassword) {
  throw new Error(
    "MONGO_APP_USERNAME and MONGO_APP_PASSWORD must be set to bootstrap the app user.",
  );
}

const playground = db.getSiblingDB("playground");

playground.createUser({
  user: appUser,
  pwd: appPassword,
  roles: [{ role: "readWrite", db: "playground" }],
});

print(`[mongo-init] created user "${appUser}" on db "playground"`);

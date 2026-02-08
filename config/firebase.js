// /config/firebase-admin.js
// import admin from "firebase-admin";

// console.log("🔥 Firebase Admin apps before init:", admin.apps.length);

// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.applicationDefault(),
//   });
//   console.log("✅ Firebase Admin initialized");
// } else {
//   console.log("✅ Firebase Admin already initialized");
// }

// export default admin;
import admin from "firebase-admin";
import fs from "fs";

const serviceAccount = JSON.parse(
  fs.readFileSync("/etc/secrets/firebase-key.json", "utf8")
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized");
}

export default admin;

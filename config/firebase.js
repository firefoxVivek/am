// /config/firebase-admin.js
import admin from "firebase-admin";

console.log("🔥 Firebase Admin apps before init:", admin.apps.length);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log("✅ Firebase Admin initialized");
} else {
  console.log("✅ Firebase Admin already initialized");
}

export default admin;

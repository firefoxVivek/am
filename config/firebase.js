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

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized");
}

export default admin;

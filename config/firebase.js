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

import serviceAccount  from "path/to/serviceAccountKey.json";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
export default admin;

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ⚠️ dotenv MUST be configured before any other import that reads process.env
dotenv.config({ path: path.resolve(__dirname, "./.env") });

import "../config/firebase.js";
import connectDB from "./db/index.js";
import { app }   from "./app.js";

connectDB()
  .then(() => {
    app.listen(process.env.PORT || 8000, () => {
      console.log(`⚙️  Server running at port: ${process.env.PORT || 8000}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err);
  });
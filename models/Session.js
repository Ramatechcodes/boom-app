const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  sessionId: String,
  paid: Boolean,
  accessCode: String,
  expiresAt: Date,   // ✅ NEW
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Session", sessionSchema);
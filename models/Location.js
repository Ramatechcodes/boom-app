const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  sessionId: String,
  latitude: Number,
  longitude: Number,
  address: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Location", locationSchema);
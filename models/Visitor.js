const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema({
  ip: String,
  country: String,
  city: String,
  browser: String,
  device: String,
  page: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Visitor", visitorSchema);

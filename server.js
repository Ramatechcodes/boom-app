require("dotenv").config();
const express = require("express");
const http = require("http");

const { Server } = require("socket.io");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const Session = require("./models/Session");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));


const API_KEY = process.env.GOOGLE_API_KEY;
app.post("/pay", async (req, res) => {
  const sessionId = uuidv4();
  const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const response = await axios.post(
  "https://api.flutterwave.com/v3/payments",
  {
    tx_ref: sessionId,
    amount: 3000,
    currency: "NGN",
    redirect_url: `http://localhost:3000/success/${sessionId}`,

    customer: {
      email: req.body.email,
      name: "Customer"
    },

    customizations: {
      title: "Tracker SaaS",
      description: "Access to live tracking dashboard"
    }
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET}`,
      "Content-Type": "application/json"
    }
  }
);
  // save pending session
  await Session.create({
    sessionId,
    paid: false,
    accessCode
  });

  res.json({
    paymentLink: response.data.data.link
  });
});
app.get("/success/:sessionId", async (req, res) => {

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  const session = await Session.findOneAndUpdate(
    { sessionId: req.params.sessionId },
    { 
      paid: true,
      expiresAt   // ✅ SAVE EXPIRY
    },
    { new: true }
  );

  res.send(`
  <h2>Payment Successful 🎉</h2>
  <h3>Your Access Code:</h3>
  <h1>${session.accessCode}</h1>

  <script>
    localStorage.setItem("sessionId", "${session.sessionId}");
  </script>

  <button onclick="go()">Open Dashboard</button>

  <script>
    function go(){
      window.location.href = "/dashboard/${session.accessCode}";
    }
  </script>
`);
});
app.get("/verify/:code", async (req, res) => {

const session = await Session.findOne({
  accessCode: req.params.code,
  paid: true
});

if (!session) return res.json({ error: true });

if (new Date() > session.expiresAt) {
  return res.json({ error: "expired" });
}

return res.json({ ok: true });
});
const Location = require("./models/Location");

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-session", (sessionId) => {
    socket.join(sessionId);
  });

  socket.on("send-location", async (data) => {
    const { sessionId, latitude, longitude } = data;

    const address = await getAddress(latitude, longitude);
 // 🟢 PRINT IN TERMINAL
    console.log("📍 LOCATION UPDATE:");
    console.log("Lat:", latitude);
    console.log("Lng:", longitude);
    console.log("Address:", address);
    console.log("----------------------");
    await Location.create({
      sessionId,
      latitude,
      longitude,
      address
    });

    io.to(sessionId).emit("receive-location", {
      latitude,
      longitude,
      address
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});
app.get("/session/:code", async (req, res) => {
  const session = await Session.findOne({
    accessCode: req.params.code
  });

  if (!session) return res.json({ error: true });

  res.json({
    expiresAt: session.expiresAt,
    sessionId: session.sessionId   // ✅ ADD THIS
  });
});
app.get("/locations/:code", async (req, res) => {

  const session = await Session.findOne({
    accessCode: req.params.code,
    paid: true
  });

  if (!session || new Date() > session.expiresAt) {
    return res.json({ error: "Expired or invalid" });
  }

  const data = await Location.find({
  sessionId: session.sessionId
}).sort({ createdAt: -1 }).limit(100);
  res.json(data);
});
app.get("/dashboard/:code", async (req, res) => {

  const session = await Session.findOne({
    accessCode: req.params.code,
    paid: true
  });

  if (!session) {
    return res.send("❌ Invalid Access Code");
  }

  // ✅ CHECK EXPIRY
  if (new Date() > session.expiresAt) {
    return res.send(`
      <h2>⛔ Access Expired</h2>
      <p>Your 30 minutes has ended</p>
      <a href="/pay.html">Purchase again</a>
    `);
  }

  return res.sendFile(__dirname + "/public/dashboard.html");
});
// 🧠 function to convert lat/lng → address
async function getAddress(lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`;

    const res = await axios.get(url);

    if (res.data.results.length > 0) {
      return res.data.results[0].formatted_address;
    }

    return "Address not found";
  } catch (err) {
    console.log("Geocode error:", err.message);
    return "Error getting address";
  }
}


const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));
server.listen(process.env.PORT, () => {
  console.log("Server running on http://localhost:3000");
});

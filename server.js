require("dotenv").config();
const express = require("express");
const http = require("http");

const { Server } = require("socket.io");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const Session = require("./models/Session");
const Visitor = require("./models/Visitor");
const useragent = require("express-useragent");
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const bodyParser = require("body-parser");
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public"));
app.use(useragent.express());

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
      title: "Ramatechcode Tracking App",
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
app.set("trust proxy", true);

app.use(async (req, res, next) => {

  try {

    let ip = req.headers["x-forwarded-for"] || req.ip;

    // remove extra IPs
    if (ip.includes(",")) {
      ip = ip.split(",")[0];
    }

    // remove IPv6 prefix
    ip = ip.replace("::ffff:", "");

    // skip localhost
    if (
      ip === "127.0.0.1" ||
      ip === "::1"
    ) {
      return next();
    }

    // use ipwho.is instead of ip-api
    const geo = await axios.get(
      `https://ipwho.is/${ip}`
    );

    await Visitor.create({
      ip,
      country: geo.data.country || "Unknown",
      city: geo.data.city || "Unknown",
      browser: req.useragent.browser,
      device: req.useragent.source,
      page: req.originalUrl
    });

  } catch (err) {

    console.log(
      "Visitor tracking error:",
      err.message
    );

  }

  next();

});
app.get("/admin", async (req, res) => {

  const pin = req.query.pin;

  if (pin !== "Ramadan@14") {
    return res.send(`
      <h2>🔒 Admin Login</h2>

      <form>
        <input 
          type="password" 
          name="pin" 
          placeholder="Enter Admin PIN"
        >

        <button type="submit">
          Login
        </button>
      </form>
    `);
  }

  const visitors = await Visitor
    .find()
    .sort({ createdAt: -1 })
    .limit(100);

  let html = `
    <h1>Admin Panel</h1>

    <style>
      body{
        font-family:Arial;
        background:#0f172a;
        color:white;
        padding:20px;
      }

      .card{
        background:#1e293b;
        padding:15px;
        margin:10px 0;
        border-radius:10px;
      }
    </style>
  `;

  visitors.forEach(v => {

    html += `
      <div class="card">
        <b>IP:</b> ${v.ip}<br>
        <b>Country:</b> ${v.country}<br>
        <b>City:</b> ${v.city}<br>
        <b>Browser:</b> ${v.browser}<br>
        <b>Device:</b> ${v.device}<br>
        <b>Page:</b> ${v.page}<br>
        <b>Time:</b> ${new Date(v.createdAt).toLocaleString("en-NG", {
  timeZone: "Africa/Lagos"
})}
      </div>
    `;
  });

  res.send(html);
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

  // ✅ MASTER PIN BYPASS
  if (req.params.code === process.env.MASTER_PIN) {
    return res.json({
      ok: true,
      master: true
    });
  }

  const session = await Session.findOne({
    accessCode: req.params.code,
    paid: true
  });

  if (!session) {
    return res.json({ error: true });
  }

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

  // ✅ MASTER PIN
  if (req.params.code === process.env.MASTER_PIN) {

    return res.json({
      expiresAt: new Date(
        Date.now() + 999999999
      )
    });

  }

  const session = await Session.findOne({
    accessCode: req.params.code
  });

  if (!session) {
    return res.json({ error: true });
  }

  res.json({
    expiresAt: session.expiresAt,
    sessionId: session.sessionId
  });

});

app.get("/locations/:code", async (req, res) => {

  // ✅ MASTER PIN ACCESS
  if (req.params.code === process.env.MASTER_PIN) {

    const data = await Location
      .find()
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json(data);
  }

  const session = await Session.findOne({
    accessCode: req.params.code,
    paid: true
  });

  if (!session || new Date() > session.expiresAt) {
    return res.json({ error: "Expired or invalid" });
  }

  const data = await Location.find({
    sessionId: session.sessionId
  })
  .sort({ createdAt: -1 })
  .limit(100);

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

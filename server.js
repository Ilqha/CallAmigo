const express = require("express");
const cors = require("cors");
require("dotenv").config();

const db = require("./database");
const authRoutes = require("./routes/auth");
const calleRoutes = require("./routes/calle");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);
app.use("/api/calle", calleRoutes);

// Test route
app.get("/", (req, res) => {
    res.json({
        message: "CallAmigo backend is running! 🚀"
    });
});

// Start server
const PORT = 5000;

app.listen(PORT, () => {
    console.log(`CallAmigo server running on http://localhost:${PORT}`);
});
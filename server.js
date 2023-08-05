// Import all necessary packages
const express = require("express");
const ejs = require("ejs");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
require("dotenv").config();

// Importing all routes from mainRoutes
const mainRoutes = require("./routes/mainRoutes.js");

// Initialising express
const app = express();

// Defining our port
const port = process.env.PORT || 1234;

// Mongoose URI to connect to database
const dbUri = `mongodb+srv://Ayinla:${process.env.MONGOOSE_PASSWORD}@agentsite.aimurix.mongodb.net/tripQuest?retryWrites=true&w=majority`;

// Connecting app to database
mongoose
  .connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then((results) => {
    console.log("Connected to dataBase");
    app.listen(port, () => {
      console.log(`Server is listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });

// Setting view engine to EJS for rendering dynamic content
app.set("view engine", "ejs");

// Enabling cookie parser to parse cookies in incoming request
app.use(cookieParser());

app.use(express.urlencoded({ extended: true }));

// Get static files from "static directory"
app.use(express.static("static"));

// Using routes imported from mainRoutes
app.use(mainRoutes);

// Import all necessary packages
const mongoose = require("mongoose");

// Making a Schema for the user data
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    firstname: {
      type: String,
      required: true,
    },
    lastname: {
      type: String,
      required: true,
    },
    mail: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// Connecting Schema to database
const User = mongoose.model("User", userSchema);

// Exporting Schema
module.exports = User;

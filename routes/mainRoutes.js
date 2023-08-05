// Import all necessary packages
const express = require("express");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const Amadeus = require("amadeus");
const ObjectId = require("mongoose").Types.ObjectId;
require("dotenv").config();

// Create an instance of the epress router to handle routes
const router = express.Router();

// Importing the User and Booking models for the database
const User = require("../models/Users");
const Booking = require("../models/booking");

// Create new amadeus instance to get live flight booking records
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_ID,
  clientSecret: process.env.AMADEUS_SECRET,
});

// Get route to landing page
router.get("/", async (req, res) => {
  // Check if session token exist
  const token = req.cookies.tripQuestToken;
  if (token) {
    try {
      // Check if session token is still valid
      const user = jwt.verify(token, process.env.JWT_SECRET);

      // Get all query data from the url link
      const query = req.query;
      try {
        // Fetch all user details from database
        const userDetails = await User.findById(user.data._id);
        const bookings = await Booking.find({ user: { $eq: userDetails._id } });

        // Calculates the amount of booked flight for the user
        var bookingsAmount = bookings.length;
      } catch (error) {
        // If an error occurs during retrieving user details, end session and redirect to login
        res.clearCookie("tripQuestToken");
        res.render("/login", {
          error: "Please Login.",
        });
      }

      // Rendering the landing page with user and booking details
      res.render("landing_page", {
        user,
        title: "tripQuest",
        bookingsAmount,
        error: query.error,
        success: query.success,
      });
    } catch {
      // If token is invalid (expired) end session and rrdirect to login
      res.clearCookie("tripQuestToken");
      return res.render("login", {
        error: "Session Expired",
      });
    }
  } else {
    // If no token found, render landing page without user data
    res.render("landing_page", {
      title: "tripQuest",
      user: null,
    });
  }
});

// Get route to login page
router.get("/login", (req, res) => {
  res.render("login", {
    error: "",
  });
});

// Get route to logout page (end session)
router.get("/logout", (req, res) => {
  res.clearCookie("tripQuestToken");
  return res.redirect("/");
});

// Get route to the registration page
router.get("/registration", (req, res) => {
  res.render("registration", {
    error: "",
  });
});

// Fetch user input from the registration page using the POST method
router.post("/registration", async (req, res) => {
  const registrationInfo = req.body;

  // Using bcrypt to encrypt user password before sending to database for added security
  bcrypt.hash(registrationInfo.password, 10, async function (err, hashed) {
    if (err) {
      console.log(err);
    }
    try {
      // Check if inputted mail already exist
      const mailCheck = await User.findOne({ mail: registrationInfo.usermail });
      if (mailCheck) {
        // If mail exist redirect to registration page and throw error 🚨 message
        res.render("registration", {
          error: "User already Exist",
        });
      } else {
        // If mail does not exist, create new user
        const newUser = new User({
          firstname: registrationInfo.firstname,
          lastname: registrationInfo.lastname,
          mail: registrationInfo.usermail,
          password: hashed,
        });

        // After creating user redirect to login page
        await newUser.save();
        res.render("login", { error: "Account created" });
      }
    } catch (error) {
      console.log(error);
      res.redirect("/registration");
    }
  });
});

// Fetch user input from the login page using the POST method
router.post("/login", async (req, res) => {
  // Get all data in the body of the request
  const loginInfo = req.body;

  // Check if user really eist
  const existingUser = await User.findOne({ mail: loginInfo.usermail });

  if (existingUser) {
    // If user exist, encrypt the inputed password and compare it to the user's password 🔏
    bcrypt.compare(
      loginInfo.password,
      existingUser.password,
      function (err, result) {
        if (result) {
          // If password matches, create new session for user (session is only valid for 30mins)
          const token = jwt.sign(
            { data: existingUser },
            process.env.JWT_SECRET,
            {
              expiresIn: "30m",
            }
          );

          // Save sessio token as a cookie
          res.cookie("tripQuestToken", token, {
            httpOnly: true,
          });

          // Checks for any unhandles search quary and redirect to the search page
          const query = req.cookies.query;
          if (query) {
            res.redirect("/search_result");
          } else {
            res.redirect("/");
          }
        } else {
          // If password does not match throw error 🚨
          res.render("login", { error: "Incorrect password" });
        }
      }
    );
  } else {
    // If user was not found, throw erroe
    res.render("login", { error: "User does not exist" });
  }
});

// Get route to search result page
router.get("/search_result", async (req, res) => {
  // Checks for any search quary
  const query = req.cookies.query;
  let search;
  if (query) {
    search = query;
    res.clearCookie("query");
  } else {
    search = req.query;
  }

  // Chack if user session is still valid
  const token = req.cookies.tripQuestToken;
  if (token) {
    try {
      var user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      res.clearCookie("tripQuestToken");
      res.cookie("query", search, {
        httpOnly: true,
      });
      return res.render("login", {
        // If session has expired, ridirect to login
        error: "Session expired",
      });
    }
    try {
      // Fetch flight data using amadeus API
      var response = await amadeus.shopping.flightOffersSearch.get({
        originLocationCode: search.Location,
        destinationLocationCode: search.Destination,
        departureDate: search.date,
        adults: search.travelers,
        currencyCode: "NGN",
        max: 8,
      });
    } catch (error) {
      // Catch any error while fetching
      res.clearCookie("query");
      // res.send({ error: error.message });
      res.redirect("/");
    }

    // Checks if the responce is valid ✔️
    const offer = response.data;
    if (offer.length < 1) {
      const error = {
        // If responce is invalid throw error 🚨
        name: "No flight found",
      };
      return res.redirect(`/?error=${error.name}`);
    }
    const dataList = [];

    // Getting data from API responce 📁
    try {
      for (const flight of offer) {
        const carrier = flight.itineraries[0].segments[0].carrierCode;
        const stopLocation = [];
        const flightSegment = flight.itineraries[0].segments;
        const numberOfStop = flightSegment.length - 1;

        //
        //// 1 second rest between each API call inorder to abide by the 1 request / 1000ms rule
        //// So the this process would be a little bit slow 😏
        //
        await new Promise((breakRest) => setTimeout(breakRest, 1000));

        const carrierResponse = await amadeus.referenceData.airlines.get({
          airlineCodes: carrier,
        });
        var carrierData = carrierResponse.data;

        for (let i = 0; i < numberOfStop; i++) {
          stopLocation.push(flight.itineraries[0].segments[i].arrival.iataCode);
        }
        const journeyStart = flight.itineraries[0].segments[0].departure.at;
        const journeyStartDate = journeyStart.slice(0, 10);
        const journeyStartTime = journeyStart.slice(11, 16);
        const journeyEnd =
          flight.itineraries[0].segments[numberOfStop].arrival.at;
        const journeyEndDate = journeyEnd.slice(0, 10);
        const journeyEndTime = journeyEnd.slice(11, 16);
        const isRefundable =
          flight.travelerPricings[0].fareOption === "STANDARD" ? true : false;
        const hasChangePenalty =
          flight.travelerPricings[0].fareOption === "STANDARD" ? true : false;

        const gateNo = flight.itineraries[0].segments[0].departure.terminal;

        if (gateNo === "") {
          gateNo = "NA";
        }

        dataList.push({
          departure: flight.itineraries[0].segments[0].departure.iataCode,
          arrival:
            flight.itineraries[0].segments[numberOfStop].arrival.iataCode,
          carrier: carrierData[0].businessName,
          duration: flight.itineraries[0].duration,
          numberOfStop,
          stopLocation,
          journeyStartDate,
          journeyStartTime,
          journeyEndDate,
          journeyEndTime,
          price: flight.price.total,
          isRefundable,
          hasChangePenalty,
          gateNo,
          flightCode: flight.itineraries[0].segments[0].aircraft.code,
        });
      }

      // Render out search page with the flight data 🛩️
      res.render("flight", {
        user: user.data,
        flights: dataList,
        title: `${search.Location} - ${search.Destination} | tripQuest Booking Service`,
        date: search.date,
      });
    } catch (error) {
      // If any error ridirect to landing page 🚨
      console.log(error);
      res.redirect("/");
    }
  } else {
    // If search quary has been made and user is not logged in, save search query and redirect to login page 🕵️‍♀️
    res.cookie("query", search, {
      httpOnly: true,
    });
    res.render("login", {
      error: "Please Login",
    });
  }
});

// Get route to the flight deal page
router.get("/booking-deal", (req, res) => {
  const token = req.cookies.tripQuestToken;
  if (token) {
    // Check if user token is still valid ✔️
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);

      const query = req.query;
      res.render("booking", {
        data: query,
        title: `${query.departure} - ${query.arrival} booking review`,
        user,
      });
    } catch (error) {
      res.render("login", {
        error: "",
      });
    }
  } else {
    res.render("login", {
      error: "Session expired",
    });
  }
});

// Get route to save ticket
router.get("/save-ticket", async (req, res) => {
  const token = req.cookies.tripQuestToken;

  // Check if user token is still valid ✔️
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      const query = req.query;
      try {
        // Saving flight information to the database
        const newBooking = new Booking({
          departure: query.departure,
          arrival: query.arrival,
          carrier: query.carrier,
          duration: query.duration,
          journeyStartDate: query.journeyStartDate,
          journeyStartTime: query.journeyStartTime,
          journeyEndDate: query.journeyEndDate,
          journeyEndTime: query.journeyEndTime,
          price: query.price,
          gateNo: query.gateNo,
          flightCode: query.flightCode,
          user: user.data._id,
        });
        await newBooking.save();

        // After flight data is saved, redirect back to landing page 😃
        res.redirect("/?success=Flight booked");
      } catch (error) {
        console.error(error);
        res.redirect("/?error=An error occured during booking, try again");
      }
    } catch (error) {
      res.render("login", {
        error: "Session expired",
      });
    }
  } else {
    // If token is expired, redirect back to login 🚨
    res.render("login", {
      error: "Please login",
    });
  }
});

// Get route to cart page
router.get("/booking/cart", async (req, res) => {
  // Check if user token is still valid
  const token = req.cookies.tripQuestToken;
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      try {
        // Get user and bookings information from the database 📚
        const userDetails = await User.findById(user.data._id);
        const bookings = await Booking.find({ user: { $eq: userDetails._id } });
        res.render("cart", {
          user: user.data,
          bookings,
          title: `${user.data.firstname} Booking details • tripQuest`,
        });
      } catch {
        console.log(error);
        res.redirect("/");
      }
    } catch (error) {
      res.clearCookie("tripQuestToken");
      return res.redirect("/login");
    }
  } else {
    // If token is expired, redirect back to login 🚨
    return res.redirect("/login");
  }
});

// Get route to preview the ticket using the id parameter from the url link
router.get("/ticket/preview/:id", async (req, res) => {
  const token = req.cookies.tripQuestToken;

  // Check if user token is still valid 🕵️‍♂️
  if (token) {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      try {
        // Get id parameter from the link
        const id = req.params.id;

        // Use is to get ticket infrmation from database 📚
        const booking = await Booking.findById(id);

        // Render out ticket preview
        res.render("ticket", {
          booking,
          user: user.data,
          title: `${user.data.firstname}: ${booking.departure} - ${booking.arrival} • Booking details • tripQuest`,
        });
      } catch (error) {
        res.send(error);
      }
    } catch {
      // If token is expired, redirect back to login 🚨
      res.clearCookie("tripQuestToken");
      return res.redirect("/login");
    }
  }
});

// Export router routes
module.exports = router;

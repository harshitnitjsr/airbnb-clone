const express = require("express");
const fs = require("fs");
const app = express();
const bcrypt = require("bcryptjs");
const cors = require("cors");
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/user");
const Place = require("./models/place");
const bcryptsalt = bcrypt.genSaltSync(10);
const jwt = require("jsonwebtoken");
const jwtSecret = "mdskjadskjbkjzxzgk";
const cookieParser = require("cookie-parser");
const imageDownloader = require("image-downloader");
const multer = require("multer");
const Booking = require("./models/booking");
const cloudinary = require("cloudinary").v2;
app.use("/uploads", express.static(__dirname + "/uploads"));
app.use(express.json());
app.use(cookieParser());
const allowedOrigins = ["http://localhost:5173"];

app.use(
  cors({
    credentials: true,
    origin: "http://localhost:5173",
  })
);

mongoose
  .connect(process.env.mongo_uri)
  .then(() => console.log("Connected to Mongo"))
  .catch((err) => console.log(err));

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});
const upload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: 5000000 }, // 500 KB limit
});
const uploadFile = async (filePath) => {
  console.log(process.env.CLOUD_NAME);
  console.log(process.env.CLOUD_KEY);
  console.log(process.env.CLOUD_SECRET);
  try {
    const result = await cloudinary.uploader.upload(filePath);
    console.log(result.secure_url);
    return result.secure_url;
  } catch (error) {
    console.log(error);
    return error;
  }
};

app.get("/api/test", (req, res) => {
  res.json("Hello World!");
});
app.post("/api/register", async (req, res) => {
  console.log(1);
  const { name, email, password } = req.body;
  try {
    console.log(2);

    const userDoc = await User.create({
      name,
      email,
      password: bcrypt.hashSync(password, bcryptsalt),
    });
    res.json(userDoc);
    console.log(3);
  } catch (e) {
    console.log(e);
    res.status(422).json(e);
  }
});
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const userdoc = await User.findOne({ email });
  if (!userdoc) {
    res.status(422).json("Invalid Credentials");
  } else {
    if (bcrypt.compareSync(password, userdoc.password)) {
      jwt.sign(
        { email: userdoc.email, id: userdoc._id },
        jwtSecret,
        {},
        (err, token) => {
          if (err) throw err;
          else {
            res
              .cookie("token", token, {
                expires: new Date(Date.now() + 1000 * 60 * 60 * 1000),
                maxAge: 1000 * 60 * 60 * 1000,
                httpOnly: true,
                sameSite: "none",
                secure: true,
              })
              .json(userdoc);
          }
        }
      );
    } else {
      res.status(422).json("Invalid Credentials");
    }
  }
});

app.get("/api/profile", (req, res) => {
  const { token } = req.cookies;
  if (token) {
    jwt.verify(token, jwtSecret, async (err, userdata) => {
      if (err) {
        res.status(422).json(err);
      } else {
        try {
          const { name, email, _id } = await User.findById(userdata.id); // Fix here
          res.json({ name, email, _id });
        } catch (error) {
          res.status(422).json(error);
        }
      }
    });
  } else {
    res.json(null);
  }
});

app.post("/api/logout", (req, res) => {
  res
    .cookie("token", "", {
      expires: new Date(0), // Expire the cookie immediately
      httpOnly: true,
      sameSite: "none",
      secure: true,
    })
    .json({ success: true });
});
app.post("/api/upload-by-link", async (req, res) => {
  console.log("k");
  try {
    const { link } = req.body;

    const fileurl = await cloudinary.uploader.upload(link);
    console.log(fileurl);

    res.json(fileurl.secure_url);
  } catch (e) {
    res.status(422).json({ error: e.message });
  }
});
const photosmiddleware = multer({ dest: "uploads/" });
const uploadFun = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files were uploaded." });
    }

    const uploadPromises = req.files.map((file) => {
      console.log(file.path);
      return uploadFile(file.path);
    });
    const uploadResults = await Promise.all(uploadPromises);
    console.log("uploadresults", uploadResults);
    res.json(uploadResults);
  } catch (e) {
    res.status(422).json({ error: e.message });
  }
};

app.post("/api/upload", upload.array("photos", 100), uploadFun);

app.post("/api/places", (req, res) => {
  const { token } = req.cookies;
  const {
    title,
    address,
    addedPhotos,
    description,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
    price,
  } = req.body;
  console.log("added photos", addedPhotos);
  jwt.verify(token, jwtSecret, {}, async (err, userdata) => {
    if (err) {
      throw err;
    }
    const placeDoc = await Place.create({
      owner: userdata.id,
      title,
      address,
      photos: addedPhotos,
      description,
      perks,
      extraInfo,
      checkIn,
      checkOut,
      maxGuests,
      price,
    });
    console.log("place docs", placeDoc);
    res.json(placeDoc);
  });
});
app.get("/api/user-places", (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, jwtSecret, async (err, userdata) => {
    const { id } = userdata;
    res.json(await Place.find({ owner: id }));
  });
});
app.get("/api/places/:id", async (req, res) => {
  const { id } = req.params;
  res.json(await Place.findById(id));
});

app.put("/api/places", async (req, res) => {
  const { token } = req.cookies;
  const {
    id,
    title,
    address,
    addedphotos,
    description,
    perks,
    extraInfo,
    checkIn,
    checkOut,
    maxGuests,
    price,
  } = req.body;
  jwt.verify(token, jwtSecret, async (err, userdata) => {
    const placeDoc = await Place.findById(id);
    if (userdata.id === placeDoc.owner.toString()) {
      placeDoc.set({
        title,
        address,
        photos: addedphotos,
        description,
        perks,
        extraInfo,
        checkIn,
        checkOut,
        maxGuests,
        price,
      });
      await placeDoc.save();
      res.json("ok");
    }
  });
});

app.get("/api/places", async (req, res) => {
  res.json(await Place.find());
});

app.post("/api/bookings", async (req, res) => {
  const userdata = await getuserdatafromtoken(req);
  console.log(userdata);
  const { place, checkIn, checkOut, numberofGuests, name, phone, price } =
    req.body;
  Booking.create({
    place,
    checkIn,
    checkOut,
    numberofGuests,
    name,
    phone,
    price,
    user: userdata.id,
  })
    .then((doc) => {
      res.json(doc);
    })
    .catch((err) => {
      throw err;
    });
});

function getuserdatafromtoken(req) {
  return new Promise((resolve, reject) => {
    jwt.verify(req.cookies.token, jwtSecret, async (err, userdata) => {
      if (err) throw err;
      else {
        resolve(userdata);
      }
    });
  });
}
app.get("/api/bookings", async (req, res) => {
  const userdata = await getuserdatafromtoken(req);
  console.log(userdata);
  res.json(await Booking.find({ user: userdata.id }).populate("place"));
});
app.listen(4000, () => {
  console.log("Example app listening on port 3000!");
});

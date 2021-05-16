const { hosts } = require("./config/appConfig");
const {
  joinGroup,
  leaveGroup,
  updateField,
  lockField,
  unlockField,
  getDocument,
  getUserList,
} = require("./socket/socketSessionHandler");
const fs = require('fs');
const jwt = require("jsonwebtoken");
const app = require("express")();
const http = require("http").Server(app);
var cors = require("cors");
const SendDocumentCronJob = require("./crons/sendDocuments");

require("dotenv").config();
const port = process.env.PORT || 3000;

const io = require("socket.io")(http, {
  cors: {
    origins: hosts,
  },
});

// use the Redis adapter to allow using multiple socket.io nodes
let redisPort = process.env.REDIS_PORT || 6379;
let redisHost = process.env.REDIS_HOST || "localhost";
const redis = require("socket.io-redis");
io.adapter(redis({ host: redisHost, port: redisPort }));
console.log(`using Redis server on ${redisHost}:${redisPort}...`);

// when using PEM encoded keys, jwt.verify() only works with the public key
//var privateKey = fs.readFileSync('./private.pem');
var publicKey = fs.readFileSync('./public.pem');
console.log("loaded JWT public key...");

app.use(cors());

app.use((err, _req, res, _) => {
  handleError(err, res);
});

app.get("/", (req, res) => {
  res.send("Hier gibt's nichts zu sehen.");
});

// Middleware for socket authentication
io.use(function(socket, next) {
  if (socket.handshake.auth && socket.handshake.auth.token) {
    console.log("trying handshake...");

    jwt.verify(
      socket.handshake.auth.token,
      publicKey,
      function(err, decoded) {
        if (err) {
          console.log('jwt verify failed');
          console.debug(err);
          return next(new Error("Authentication error"));
        }

        // store the full JWT, we need it later to send
        // updates to the API in the name of the user
        socket.jwt = socket.handshake.auth.token

        // store only the relevant parts of the decoded JWT,
        // we need them to check if the user is allowed to join
        // the room and also to send them to the group to list
        // online users
	socket.authData = {
          id: decoded.id,
          username: decoded.username,
          editableProjects: decoded.editableProjects,

          // @todo remove debug
          groupID: decoded.groupID,
        }

        next();
      }
    );
  } else {
    console.log('no jwt found in handshake');
    next(new Error("Authentication error"));
  }
});

// Socket Connections and Listeners
io.on("connection", (socket) => {
  try {
    // listener for joining group
    socket.on("joinGroup", (sessionInfo, reply) => joinGroup(sessionInfo, reply, socket, io));

    // listener for requesting userlist
    socket.on("getUserList", (sessionInfo) => getUserList(sessionInfo, socket, io));

    // listener for requesting document
    socket.on("getDocument", (sessionInfo) => getDocument(sessionInfo, socket, io));

    // listener for locking field
    socket.on("lockField", (fieldInfo) => lockField(fieldInfo, socket, io));

    // listener for updating field
    socket.on("updateField", (fieldInfo) => updateField(fieldInfo, socket, io));

    // listener for unlocking field
    socket.on("unlockField", (fieldInfo) => unlockField(fieldInfo, socket, io));

    // listen for disconnects
    socket.on("disconnect", (sessionInfo) => {
      leaveGroup(sessionInfo, socket, io);
    });
  } catch (err) {
    console.log(err);
  }
});

// Cron Job
SendDocumentCronJob.start();

// Server Listening
http.listen(port, () => {
  console.log(`Socket.IO server running at http://localhost:${port}/`);
});

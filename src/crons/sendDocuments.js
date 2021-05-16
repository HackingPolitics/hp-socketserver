var cron = require("node-cron");

SendDocument = cron.schedule("1-59 * * * *", async () => {
  try {
//    console.log("Data is sent to the api");
  } catch (error) {
    console.log("Error Occurred in cron job");
  }
});

module.exports = SendDocument;

let hosts = [];
if (process.env.NODE_ENV === "production") {
  hosts = ["https://abc.xyz"];
} else {
  hosts = ["http://localhost:3002"];
}
module.exports = hosts;

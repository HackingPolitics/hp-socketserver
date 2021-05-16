const redis = require("redis");
let bluebird = require("bluebird");

let redisPort = process.env.REDIS_PORT || 6379;
let redisHost = process.env.REDIS_HOST || "localhost";

bluebird.promisifyAll(redis);

const client = redis.createClient({ host: redisHost, port: redisPort });

const expirationTime = 100000;
const documentPrefix = "groupDocument=";
const groupPrefix = "group=";

client.on("error", (err) => {
  console.log(err);
});

function setCacheEntry(key, data) {
  client.setex(key, expirationTime, data);
}
async function removeCacheEntry(key) {
  return await client.del(key);
}

async function getUserListFromCache(groupID) {
  var key = groupPrefix + groupID;
  let cacheData = await client.getAsync(key);
  return JSON.parse(cacheData);
}

// return the user list without the private details
async function getCleanUserListFromCache(groupID) {
  let list = await getUserListFromCache(groupID)

  for (const id in list) {
    // @todo remove debug
    delete list[id].groupID;

    delete list[id].socketID;
    delete list[id].editableProjects;
  }

  return list;
}

async function getDocumentFromCache(groupID) {
  var key = documentPrefix + groupID;
  let cacheData;
  let p = new Promise((success, failure) => {
    client.hgetall(key, function (err, obj) {
      success(obj);
    });
  });

  await p.then((value) => {
    let doc = value;
    Object.keys(value).forEach((item) => {
      doc[item] = JSON.parse(doc[item]);
    });
    cacheData = doc;
  })
  .catch(err => console.log(err));

  return cacheData;
}

async function addUserToList(userInfo) {
  var key = groupPrefix + userInfo.groupID;
  let cacheData = await getUserListFromCache(userInfo.groupID);
  if (cacheData) {
    if (cacheData[userInfo.id]) {
      // already in list, ignore
    } else {
      cacheData[userInfo.id] = userInfo;
    }
  } else {
    cacheData = {
      [userInfo.id]: userInfo,
    };
  }

  return setCacheEntry(key, JSON.stringify(cacheData));
}

async function removeUserFromLIst(userInfo) {
  var key = groupPrefix + userInfo.groupID;
  let cacheData = await getUserListFromCache(userInfo.groupID);
  if (cacheData && cacheData[userInfo.id]) {
    delete cacheData[userInfo.id];
  }

  return setCacheEntry(key, JSON.stringify(cacheData));
}

async function updateDocumentCache(userInfo, fieldInfo) {
  var key = documentPrefix + userInfo.groupID;

  client.hset(key, fieldInfo.fieldID, JSON.stringify(fieldInfo));

  return getDocumentFromCache(userInfo.groupID, fieldInfo.fieldID);
}

async function updateDocumentUnlockFieldsByUserCache(userInfo) {
  var key = documentPrefix + userInfo.groupID;

  let p = new Promise((success, failure) => {
    client.hgetall(key, function (err, obj) {
      success(obj);
    });
  });

  await p.then((value) => {
    let doc = value;
    Object.keys(value).forEach((item) => {
      doc[item] = JSON.parse(doc[item]);

      if (doc[item].lockedByUserID === userInfo.id) {
        doc[item].lockedByUserID = null;
        doc[item].lockedByUsername = null;

        client.hset(key, item, JSON.stringify(doc[item]), function (err, obj) {
          console.log(err);
          console.log(obj);
        });
      }
    });
  })
  .catch(err => console.log(err));
}

module.exports = {
  getDocumentFromCache,
  getUserListFromCache,
  getCleanUserListFromCache,
  addUserToList,
  removeUserFromLIst,
  updateDocumentCache,
  updateDocumentUnlockFieldsByUserCache,
};

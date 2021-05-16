const {
  addUserToList,
  getCleanUserListFromCache,
  removeUserFromLIst,
  updateDocumentCache,
  getDocumentFromCache,
  updateDocumentUnlockFieldsByUserCache,
} = require("../cache/redisCache");

// add the users in groups and create groups
let joinGroup = async (projectId, reply, socket, io) => {
  console.log(`requested projectID: ${projectId}`);
  console.debug("reply", reply)

  let userInfo = socket.authData;

  //if (socket.authData.editableProjects.indexOf(projectId) !== -1) {
  //  socket.join("Group-" + projectId);
  //  reply({status: "ok"})
  //}
  //else {
  //  reply({status: "forbidden"})
  //}

  // @todo remove debug
  socket.join("Group-" + userInfo.groupID);
  if (typeof reply == "function") {
    reply({status: "ok"})
  }

  userInfo["socketID"] = socket.id;
  await addUserToList(userInfo);
  console.log("(v5) user joined ", userInfo);

  // Aktualisierte Userliste an die gesamte Gruppe schicken
  io.to("Group-" + userInfo.groupID)
    .emit("updateUsers", await getCleanUserListFromCache(userInfo.groupID));
};

// removes the users from the group
let leaveGroup = async (sessionInfo, socket, io) => {
  let userInfo = socket.authData;

  console.log("user left ", userInfo);
  await removeUserFromLIst(userInfo);
  await updateDocumentUnlockFieldsByUserCache(userInfo);

  // Aktualisierte Userliste an die gesamte Gruppe schicken
  io.to("Group-" + userInfo.groupID)
    .emit("updateUsers", await getCleanUserListFromCache(userInfo.groupID));
};

// return the userList to the requesting user
let getUserList = async (sessionInfo, socket, io) => {
  let userInfo = socket.authData;
  console.log("userList requested");

  socket.emit("updateUsers", await getCleanUserListFromCache(userInfo.groupID));
};

// return the document to the requesting user
let getDocument = async (sessionInfo, socket, io) => {
  let userInfo = socket.authData;
  console.log("document requested");

  socket.emit("updateDocument", await getDocumentFromCache(userInfo.groupID));
};

// updates the fields on changes
let updateField = async (fieldInfo, socket, io) => {
  let userInfo = socket.authData;

  console.log("updateField", fieldInfo);
  let info = {
    ...fieldInfo,
    lockedByUserID: userInfo.id,
    lockedByUsername: userInfo.username,
  };
  await updateDocumentCache(userInfo, info);

  // geändertes Dokument an alle anderen in der Gruppe schicken
  socket.to("Group-" + userInfo.groupID)
    .emit("updateDocument", await getDocumentFromCache(userInfo.groupID));
};

// lock the field
let lockField = async (fieldInfo, socket, io) => {
  let userInfo = socket.authData;

  let info = {
    ...fieldInfo,
    lockedByUserID: userInfo.id,
    lockedByUsername: userInfo.username,
  };

  console.log("lockField", fieldInfo);
  await updateDocumentCache(userInfo, info);

  // Info an alle anderen in der Gruppe schicken
  socket.to("Group-" + userInfo.groupID)
    .emit("updateDocument", await getDocumentFromCache(userInfo.groupID));
};

// unlock the field
let unlockField = async (fieldInfo, socket, io) => {
  let userInfo = socket.authData;

  let info = {
    ...fieldInfo,
    lockedByUserID: null,
    lockedByUsername: null,
  };

  console.log("unlockField", fieldInfo);
  await updateDocumentCache(userInfo, info);

  // Info an alle anderen in der Gruppe schicken
  socket.to("Group-" + userInfo.groupID)
    .emit("updateDocument", await getDocumentFromCache(userInfo.groupID));
};

module.exports = {
  joinGroup,
  leaveGroup,
  updateField,
  lockField,
  unlockField,
  getDocument,
  getUserList,
};

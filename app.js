const express = require("express");
const app = express();
module.exports = app;

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

let db = null;

const initializationDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000);
  } catch (e) {
    console.log(`DB-error:${e.message}`);
    process.exit(1);
  }
};

initializationDBAndServer();

// Middleware Function

function AuthenticationToken(request, response, next) {
  let jwtToken = null;
  let authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401).send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401).send("Invalid JWT Token");
      } else {
        request.userDetails = payload;
        next();
      }
    });
  }
}

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const passwordLength = password.length;

  const checkUser = await db.get(checkUserQuery);
  if (checkUser !== undefined) {
    response.status(400).send("User already exists");
  } else if (passwordLength < 6) {
    response.status(400).send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const registerUserQuery = `
        INSERT INTO user(username,password,name,gender)
        VALUES (
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        );`;
    await db.run(registerUserQuery);
    response.send("User created successfully");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const checkUser = await db.get(checkUserQuery);

  if (checkUser === undefined) {
    response.status(400).send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, checkUser.password);
    if (checkPassword === false) {
      response.status(400).send("Invalid password");
    } else {
      const payload = { username: checkUser.username };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    }
  }
});

// API 3

app.get(
  "/user/tweets/feed/",
  AuthenticationToken,
  async (request, response) => {
    const { userDetails } = request;
    const getFollowingUsersQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=(
        SELECT user_id FROM user WHERE username='${userDetails.username}')
        LIMIT 4;`;

    const getFollowingUsers = await db.all(getFollowingUsersQuery);
    const followingUserIds = getFollowingUsers.map(
      (eachObject) => eachObject.following_user_id
    );

    const getTweetsQuery = `SELECT user.username, tweet.tweet, date_time AS dateTime 
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id 
    WHERE user.user_id IN (${followingUserIds.join(",")}) 
    ORDER BY dateTime DESC
    LIMIT 4;`;

    const getTweets = await db.all(getTweetsQuery);
    response.send(getTweets);
  }
);

// API 4

app.get("/user/following/", AuthenticationToken, async (request, response) => {
  const { userDetails } = request;
  const getUserFollowsQuery = `
  SELECT following_user_id FROM follower WHERE follower_user_id=(
      SELECT user_id FROM user WHERE username='${userDetails.username}');`;
  const getUserFollows = await db.all(getUserFollowsQuery);

  const getUserFollowsIds = getUserFollows.map(
    (eachObj) => eachObj.following_user_id
  );

  const getUserFollowsNamesQuery = `SELECT name FROM user
   WHERE user_id IN (${getUserFollowsIds.join(",")});`;
  const getUserFollowsName = await db.all(getUserFollowsNamesQuery);
  response.send(getUserFollowsName);
});

//API 5

app.get("/user/followers/", AuthenticationToken, async (request, response) => {
  const { userDetails } = request;
  const getUserFollowersQuery = `
  SELECT follower_user_id FROM follower WHERE following_user_id=(
      SELECT user_id FROM user WHERE username='${userDetails.username}');`;

  const getUserFollowers = await db.all(getUserFollowersQuery);
  const getUserFollowersIds = getUserFollowers.map(
    (eachObj) => eachObj.follower_user_id
  );

  const getUserFollowersNameQuery = ` SELECT name FROM user WHERE user_id IN (${getUserFollowersIds.join(
    ","
  )});`;
  const getUserFollowersName = await db.all(getUserFollowersNameQuery);
  response.send(getUserFollowersName);
});

// API 6

app.get("/tweets/:tweetId/", AuthenticationToken, async (request, response) => {
  try {
    const { userDetails } = request;
    const { tweetId } = request.params;

    const getFollowingUserIdsQuery = `
        SELECT following_user_id FROM follower WHERE follower_user_id=(
            SELECT user_id FROM user WHERE username='${userDetails.username}');`;
    const getFollowingUserIds = await db.all(getFollowingUserIdsQuery);

    const listOfFollowingUserIds = getFollowingUserIds.map(
      (eachObj) => eachObj.following_user_id
    );
    //console.log(listOfFollowingUserIds);

    const checkTweetUserQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${listOfFollowingUserIds}) AND tweet_id=${tweetId};`;

    const checkTweetUser = await db.get(checkTweetUserQuery);

    if (checkTweetUser === undefined) {
      response.status(401).send("Invalid Request");
    } else {
      const getTweetLikesQuery = `
        SELECT tweet.tweet, COUNT(like.like_id) AS likes, date_time AS dateTime 
       FROM tweet LEFT JOIN like ON tweet.tweet_id=like.tweet_id WHERE tweet.tweet_id=${tweetId};`;

      const getTweetLikes = await db.get(getTweetLikesQuery);
      const getTweetRepliesQuery = `
      SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${tweetId};`;
      const getTweetReplies = await db.get(getTweetRepliesQuery);

      response.send({
        tweet: getTweetLikes.tweet,
        likes: getTweetLikes.likes,
        replies: getTweetReplies.replies,
        dateTime: getTweetLikes.dateTime,
      });
    }
  } catch (e) {
    console.log(`Error message ${e.message}`);
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  AuthenticationToken,
  async (request, response) => {
    const { userDetails } = request;
    const { tweetId } = request.params;

    const getTweetUsersQuery = `
    SELECT following_user_id from follower WHERE follower_user_id=(
        SELECT user_id FROM user WHERE username='${userDetails.username}');`;
    const getFollowingUsers = await db.all(getTweetUsersQuery);
    const getFollowingUserIds = getFollowingUsers.map(
      (eachObj) => eachObj.following_user_id
    );

    const checkTweetIdAndFollowingUserIds = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingUserIds}) AND tweet_id=${tweetId};`;
    const getTweet = await db.get(checkTweetIdAndFollowingUserIds);

    if (getTweet === undefined) {
      response.status(401).send("Invalid Request");
    } else {
      const getTweetLikesUsersQuery = `
        SELECT user_id FROM like WHERE tweet_id=${tweetId};`;

      const getTweetLikesUsersList = await db.all(getTweetLikesUsersQuery);

      const getTweetLikesUserIdsList = getTweetLikesUsersList.map(
        (eachObj) => eachObj.user_id
      );
      const getTweetLikesUserNamesQuery = `
      SELECT username FROM user WHERE user_id IN (${getTweetLikesUserIdsList});`;
      const getTweetLikesUserNames = await db.all(getTweetLikesUserNamesQuery);

      const getTweetLikesUserNamesList = getTweetLikesUserNames.map(
        (eachObj) => eachObj.username
      );
      response.send({ likes: getTweetLikesUserNamesList });
    }
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  AuthenticationToken,
  async (request, response) => {
    const { userDetails } = request;
    const { tweetId } = request.params;

    const getFollowingUserIdsQuery = `
    SELECT following_user_id FROM follower WHERE follower_user_id=(
        SELECT user_id FROM user WHERE username='${userDetails.username}');`;
    const getFollowingUserIds = await db.all(getFollowingUserIdsQuery);
    const getFollowingUserIdsList = getFollowingUserIds.map(
      (eachObj) => eachObj.following_user_id
    );

    const checkTweetIdsFollowingUserIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingUserIdsList}) AND tweet_id=${tweetId};`;

    const checkTweetIds = await db.get(checkTweetIdsFollowingUserIdsQuery);

    if (checkTweetIds === undefined) {
      response.status(401).send("Invalid Request");
    } else {
      const getTweetRepliesQuery = `
        SELECT user_id FROM reply 
        WHERE tweet_id=${tweetId};`;
      const getTweetReplies = await db.all(getTweetRepliesQuery);
      const getReplyIdsList = getTweetReplies.map((eachObj) => eachObj.user_id);

      const getReplyUserNamesQuery = `
      SELECT user.name, reply.reply FROM user LEFT JOIN reply ON user.user_id=reply.user_id WHERE user.user_id IN (${getReplyIdsList}) AND reply.tweet_id=${tweetId};`;

      const getReplyUserNames = await db.all(getReplyUserNamesQuery);

      console.log(getReplyUserNames);
      response.send({ replies: getReplyUserNames });
    }
  }
);

// API 9

app.get("/user/tweets/", AuthenticationToken, async (request, response) => {
  const { userDetails } = request;

  const getUserIdQuery = `
  SELECT user_id FROM user WHERE username='${userDetails.username}';`;

  const getUserId = await db.get(getUserIdQuery);

  const getTweetsQuery = `
  SELECT t.tweet, COUNT(DISTINCT l.like_id) AS likes, COUNT (DISTINCT r.reply_id) AS replies, date_time AS dateTime FROM tweet AS t 
  LEFT JOIN like AS l ON t.tweet_id=l.tweet_id
  LEFT JOIN reply AS r ON t.tweet_id=r.tweet_id
  WHERE t.user_id=${getUserId.user_id} GROUP BY t.tweet_id;`;

  const getTweets = await db.all(getTweetsQuery);

  response.send(getTweets);
});

// API 10

app.post("/user/tweets/", AuthenticationToken, async (request, response) => {
  const { userDetails } = request;
  const { tweet } = request.body;

  const postTweetQuery = `
    INSERT INTO tweet(tweet)
    VALUES (
        '${tweet}'
    );`;

  const postTweet = await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete(
  "/tweets/:tweetId/",
  AuthenticationToken,
  async (request, response) => {
    const { userDetails } = request;
    const { tweetId } = request.params;

    const getTweetIdsQuery = `
    SELECT tweet_id FROM tweet WHERE user_id=(
        SELECT user_id FROM user WHERE username='${userDetails.username}');`;
    const getTweetIds = await db.all(getTweetIdsQuery);

    const getTweetIdsList = getTweetIds.map((eachObj) => eachObj.tweet_id);

    console.log(getTweetIdsList);
    console.log(tweetId);

    const tweetIdCheck = getTweetIdsList.includes(parseInt(tweetId));

    console.log(tweetIdCheck);

    if (tweetIdCheck) {
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      const deleteTweet = await db.run(deleteTweetQuery);

      response.send("Tweet Removed");
    } else {
      response.status(401).send("Invalid Request");
    }
  }
);

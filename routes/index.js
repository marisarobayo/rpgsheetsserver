var express = require('express');
var router = express.Router();
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
var cryptoRandomString = require('crypto-random-string');
var passport = require('passport');
const nano = require('nano')('http://admin:admin@localhost:5984');
const jwt = require('jsonwebtoken');

var authModule = require('../utils/auth.js');
var js = require('../app.js');

var app = js.app;
var sha512 = authModule.sha512;
var jwtSecret = authModule.jwtSecret;

// New player registration
router.post('/register', async function(req, res, next) {
  username = req.body.username;
  email = req.body.email;
  displayName = req.body.email;
  password = req.body.password;
  characterSheet = req.body.characterSheet;

  let user = {};

  users = nano.db.use('users');

  // Checking if username is taken
  view = await users.view('users', 'by_username', {
    'key': username
  })

  if (view.rows.length > 0) {
    res.status(400).send('Username is already taken.');
    return;
  }

  user.username = username;

  // Checking if email is valid
  emailPattern = /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if(!emailPattern.test(email)){
    res.status(400).send('Invalid email.');
    return;
  }

  // Checking if email is taken
  view = await users.view('users', 'by_email', {
    'key': email
  })
  if (view.rows.length > 0) {
    res.status(400).send('Email is already taken.');
    return;
  }

  user.email = email;

  // Checking if the display name is correct
  displayNamePattern = /[A-Za-z0-9 _-]+/;
  if(!displayNamePattern.test(displayName)){
    res.status(400).send('Invalid display name.');
    return;
  }

  user.displayName = displayName;

  user.passwordSalt = cryptoRandomString({length: 16});
  user.passwordHash = sha512(password, user.passwordSalt);

  user.isVerified = false;

  if (characterSheet){
     //TODO make the character sheet associated with the newly registered player
  }

  // Create activation token and save to DB
  user.verificationToken = cryptoRandomString({length: 16});
  user.verificationTokenExpireDate = new Date(new Date().getTime() + 86400000) // Set expire date to the next day

  newUser = await users.insert(user);
  players = nano.db.use('players');
  player = {
    userID : newUser.id
  }
  newPlayer = players.insert(player);

  await sendVerificationEmail(email, user.verificationToken, newUser.id);

  res.status(200).send("Player created.")
});

// Verify a player registration
router.post('/verify/:verificationToken/:userID', async function (req, res, next){
  verificationToken = req.params.verificationToken;
  userID = req.params.userID;
  
  users = nano.db.use('users');

  // Checks
  user = await users.get(userID).catch((err) => {
    res.status(400).send("User does not exist");
    return;
  });

  if(user.isVerified){
    res.status(400).send("User is already verified");
    return;
  }

  if(user.verificationToken != verificationToken){
    res.status(400).send("Verification token incorrect");
    return;
  }

  if(Date.now() > user.verificationTokenExpireDate){
    res.status(400).send("The verification token has expired. You need to create a new account");
    await users.destroy(userID, user._rev).catch((err) => {
      console.log(err);
    })
    return;
  }

  // Actual verification
  user.isVerified = true;
  user.verificationToken = "";
  users.insert(user);
  res.status(200).send("User verified")

});

// Actual login, requires username and password in body
router.post('/login', function (req, res, next) {
  passport.authenticate('local', { session: false }, function (err, user) {
    if(err || !user) {
      return res.status(400).send("Error authenticating");
    }
    const token = jwt.sign(user, jwtSecret, {expiresIn: '24h'});
    return res.json({token});
  })(req,res,next);
});

// Check if user is log in, mostly debug purposes
router.get('/login', passport.authenticate('jwt', {session: false}), function (req, res, next) {
  res.send(req.user.username);
});



async function sendVerificationEmail (to, token, userID){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'Activate your RPGSheets Account',
    text: 'this is the link: http://localhost:3000/verify?' + token,
    html: 'this is the link: <a href=\"http://localhost:3000/verify/' + token + '/' + userID + '\"> here </a>'
  }
  await sgMail.send(msg)
}

module.exports = router;


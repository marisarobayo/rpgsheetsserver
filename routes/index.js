var express = require('express');
var router = express.Router();
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
var cryptoRandomString = require('crypto-random-string');
var passport = require('passport');
const jwt = require('jsonwebtoken');

var authModule = require('../utils/auth.js');
var js = require('../app.js');
var users = require('../models/user.js');
var sheets = require('./sheets');

var app = js.app;
var sha512 = authModule.sha512;
var jwtSecret = authModule.jwtSecret;
var User = users.User;
var Player = users.Player;
var GM = users.GM;
var mongoose = js.mongoose;
var characterSheet = sheets.CharacterSheet;

// New player registration
router.post('/register', async function(req, res, next) {
  username = req.body.username;
  email = req.body.email;
  displayName = req.body.email;
  password = req.body.password;
  characterSheet = req.body.characterSheet;

  let user = {};

  console.log(req.body);
  console.log(req.body.username);
  user2 = await User.findOne({username: username});

  if (user2){
    res.status(400).send('Username is already taken.');
    return;
  }
  console.log(req.body.email);
  user.username = username;

  // Checking if email is valid
  emailPattern = /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
  if(!emailPattern.test(email)){
    console.log("email incorrecto");
    res.status(400).send('Invalid email.');
    return;
  }

  console.log("2");
  user.email = email;

  // Checking if the display name is correct
  displayNamePattern = /[A-Za-z0-9 _-]+/;
  if(!displayNamePattern.test(displayName)){
    res.status(400).send('Invalid display name.');
    return;
  }

  user.displayName = displayName;

  // Check if password is long enough
  if(password.length < 8){
    res.status(400).send('Password not long enough.');
    return;
  }

  // If there's a character sheet, check if it's okay, but we can't assign it yet
  let characterSheetObject;
  if(characterSheet && characterSheet != ""){
    characterSheetObject = await CharacterSheet.findById(characterSheet).catch((err) => {
      res.status(400).send("Character sheet incorrect");
      return;
    })
    if(!characterSheetObject){
      res.status(400).send("Character sheet incorrect");
      return;
    }
  }

  user.passwordSalt = cryptoRandomString({length: 16});
  user.passwordHash = sha512(password, user.passwordSalt);

  user.isVerified = false;

  // Create activation token and save to DB
  user.verificationToken = cryptoRandomString({length: 16});
  user.verificationTokenExpireDate = new Date(new Date().getTime() + 86400000) // Set expire date to the next day

  user = new User(user);
  await user.save();

  player = new Player({user: user._id});
  await player.save();

  if (characterSheetObject){
    sheets.assignPlayerToSheet(player, characterSheetObject);
  }

  await sendVerificationEmail(email, user.verificationToken, user._id).catch((err) => {
    res.status(500).send("There was an error in sending you the email.");
  });

  res.status(201).send("Player created.")
});

// Verify a player registration
router.post('/verify/:verificationToken/:userID', async function (req, res, next){
  verificationToken = req.params.verificationToken;
  userID = req.params.userID;
  
  user = await User.findById(userID);

  // Checks
  if (!user) {
    res.status(400).send("User does not exist");
    return;
  };

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
  user.save()
  res.status(201).send("User verified")

});

// Actual login, requires username and password in body
router.post('/login', function (req, res, next) {
  passport.authenticate('local', { session: false }, async function (err, user) {
    if(err || !user || !user.isVerified) {
      return res.status(400).send("Error authenticating");
    }

    // Getting login token ready with less properties
    let payload = {};
    payload.username = user.username;
    payload._id = user._id;

    const token = jwt.sign(payload, jwtSecret, {expiresIn: '24h'});

    let isPlayer = false;
    player = await Player.findById(user._id);
    if(player){
      isPlayer = true;
    }
    return res.json({token, isPlayer});
  })(req,res,next);
});

app.delete('/logout', function(req, res){
  req.logout();
  res.status(200).send();
});

// Get user profile
router.get('/profile', passport.authenticate('jwt', {session: false}), function (req, res, next) {
  let user = req.user;
  let response = {
    username: user.username,
    displayName: user.displayName,
    email: user.email
  }
  res.send(response);
});

router.post('/resetPassword', async function(req,res,next){
  // Checks
  let user = await User.findOne({username: req.body.username});

  if (!user) {
    res.status(400).send('Username does not exist');
    return;
  }

  email = user.email;
  if(!user.isVerified){
    res.status(400).send("User not verified");
    return;
  }

  token = cryptoRandomString({length:16});
  user.passwordResetToken = token;
  user.passwordResetTokenExpireDate = new Date(new Date().getTime() + 86400000); // Set expire date to the next day 
  user.save();

  await sendResetPasswordEmail(email, token, user._id).catch((err) => {
    res.status(500).send("There was an error in sending you the email.");
    console.log(err);
    return;
  });

  res.status(200).send("Reset email sent.")

})

router.post('/resetPassword/:passwordResetToken', async function(req,res,next){
  username = req.body.username;
  newPassword = req.body.password;
  passwordResetToken = req.params.passwordResetToken;

  // Checks
  user = await User.findOne({username: username});

  if (!user) {
    res.status(400).send('Username does not exist');
    return;
  }

  if(user.passwordResetToken != passwordResetToken ||passwordResetToken == ""){
    res.status(400).send('Token is not correct or there is not one');
  }

  if(newPassword.length < 8){
    res.status(400).send('Password not long enough.');
    return;
  }

  if(new Date() > user.passwordResetTokenExpireDate){
    res.status(400).send('Token already expired');
  }

  user.passwordSalt = cryptoRandomString({length: 16});
  user.passwordHash = sha512(newPassword, user.passwordSalt);
  user.passwordResetToken = "";
  user.save()

  res.status(201).send("Password changed");
})

// Checks if username is taken
router.get('/username/:username', async function(req,res,next) {
  username = req.params.username;

  user = await User.findOne({username: username}).catch((error) => console.log(error));

  if(user){
    res.status(200).send(true);
  } else {
    res.status(200).send(false);
  }
})

// Gets info of an user given username or password
router.get('/profile/:data', async function(req,res,next) {
  data = req.params.data;

  user = await User.findOne({username: data});

  if(user){
    res.status(200).send({id: user.id, name: user.displayName});
  } else {
    user = await User.findOne({email: data});
    if(user){
      res.status(200).send({id: user.id, name: user.displayName});
    } else {
      res.status(404);
    }
  }
})


async function sendVerificationEmail (to, token, userID){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'Activate your RPGSheets Account',
    text: 'In order to use our service, please click on the following link to active your account: https://rpgsheets.herokuapp.com/verify?' + token,
    html: 'In order to use our service, please click on the following link to active your account: <a href=\"https://rpgsheets.herokuapp.com/verify/' + token + '/' + userID + '\"> Activate </a>'
  }
  await sgMail.send(msg)
}

async function sendResetPasswordEmail (to, token, userID){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'Reset your RPGSheets Password',
    text: 'this is the link: https://rpgsheetsserver.herokuapp.com/resetPassword?' + token,
    html: 'this is the link: <a href=\"https://rpgsheetsserver.herokuapp.com/verify/' + token + '/' + userID + '\"> here </a>'
  }
  await sgMail.send(msg)
}

module.exports = router;


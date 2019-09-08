var express = require('express');
var router = express.Router();
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
var cryptoRandomString = require('crypto-random-string');
var passport = require('passport');
const jwt = require('jsonwebtoken');
const fs = require('fs');

var authModule = require('../utils/auth.js');
var js = require('../app.js');
var users = require('../models/user.js');
var CharacterSheet = require('../models/characterSheet.js').CharacterSheet;
var DWCharacterSheet = require('../models/dungeonWorldCS.js').DWCharacterSheet;

var app = js.app;
var sha512 = authModule.sha512;
var jwtSecret = authModule.jwtSecret;
var User = users.User;
var Player = users.Player;
var GM = users.GM;
var mongoose = js.mongoose;


// New player registration
router.post('/register', async function(req, res, next) {
  username = req.body.username;
  email = req.body.email;
  displayName = req.body.email;
  password = req.body.password;
  characterSheet = req.body.characterSheet;

  let user = {};

  user2 = await User.findOne({username: username});

  if (user2){
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
  user2 = await User.findOne({username: username});

  if(user2){
    res.status(400).send('Username is already taken.');
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

  // Check if password is long enough

  if(password.length < 8){
    res.status(400).send('Password not long enough.');
    return;
  }

  user.passwordSalt = cryptoRandomString({length: 16});
  user.passwordHash = sha512(password, user.passwordSalt);

  user.isVerified = false;

  if (characterSheet){
     //TODO make the character sheet associated with the newly registered player
  }

  // Create activation token and save to DB
  user.verificationToken = cryptoRandomString({length: 16});
  user.verificationTokenExpireDate = new Date(new Date().getTime() + 86400000) // Set expire date to the next day

  user = new User(user);
  await user.save();

  player = new Player({user: user._id});
  await player.save();

  await sendVerificationEmail(email, user.verificationToken, user._id).catch((err) => {
    res.status(500).send("There was an error in sending you the email.");
  });

  res.status(200).send("Player created.")
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
  res.status(200).send("User verified")

});

// Actual login, requires username and password in body
router.post('/login', function (req, res, next) {
  passport.authenticate('local', { session: false }, function (err, user) {
    if(err || !user || !user.isVerified) {
      return res.status(400).send("Error authenticating");
    }

    // Getting login token ready with less properties
    let payload = {};
    payload.username = user.username;
    payload._id = user._id;

    const token = jwt.sign(payload, jwtSecret, {expiresIn: '24h'});
    return res.json({token});
  })(req,res,next);
});

// Check if user is log in, mostly debug purposes
router.get('/login', passport.authenticate('jwt', {session: false}), function (req, res, next) {
  res.send(req.user.username);
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

  res.status(200).send("Password changed");
})

router.post('/sheets', passport.authenticate('jwt', {session: false}), function (req, res, next) {
  name = req.body.name;
  players = req.body.players;
  image = req.files.image;

  if(!name){
    res.status(400).send('Name cannot be empty');
    return;
  }

  characterSheet = new CharacterSheet();
  characterSheet.name = name;
  characterSheet.players = [];

  playersCorrect = true;
  for(player in players){
    await Player.findById(player).catch((err) => {
      playersCorrect = false;
    })
  }

  if(!playersCorrect){
    res.status(400).send("Players not correct");
    return;
  }

  if(image){
    if(image.mimetype != "image/jpeg" && image.mimetype != "image/png" && image.mimetype != "image/gif"){
      res.status(400).send("Image format not correct");
    }
  }

  await characterSheet.save();
  
  if(image){
    // Base image folder
    if(!fs.exists('../public/characterSheetImages')){
      try {
        fs.mkdirSync('../public/characterSheetImages')
      } catch(err) {
        res.status(500).send("There was an error uploading your image");
        return;
      };
    }

    // Folder for this character sheet
    if(!fs.exists('../public/characterSheetImages/' + characterSheet._id.toString())){
      try {
        fs.mkdirSync('../public/characterSheetImages' + characterSheet._id.toString())
      } catch(err) {
        res.status(500).send("There was an error uploading your image");
        return;
      };
    }

    await image.mv('../public/characterSheetImages' + characterSheet._id.toString()+"/" + "portrait").catch((err) => {
      res.status(500).send("There was an error uploading your image");
      return ;
    })

    res.status(200).send("Character sheet created");
  }
  

})

router.get('/sheets', passport.authenticate('jwt', {session: false}), function (req, res, next) {

  token = jwt.decode(res.header('token'));
  userid = token._id;

  user = await findById(userid);

  isAPlayer = true;
  
  player = await Player.findOne({user: userid}).catch((err) => {
    isAPlayer = false;
  });

  if(isAPlayer){
    sheets = await CharacterSheet.find({belongsTo: {$in: [player._id]}});

    res.status(200).send(sheets);
  } else {
    sheets = await CharacterSheet.find();
    res.status(200).send(sheets);
  }
})

router.get('/sheets/:id', passport.authenticate('jwt', {session: false}), function (req, res, next) {

  token = jwt.decode(res.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;

  user = await findById(userid);

  isAPlayer = true;
  
  player = await Player.findOne({user: userid}).catch((err) => {
    isAPlayer = false;
  });

  //If its a player check if they have permission to watch this
  if(isAPlayer){
    if(!character.belongsTo.contains(player._id)){
      res.status(400).send("You do not have permission to see this");
    }
  };

  sheet = await CharacterSheet.findById(characterSheetID).catch((err) => {
    res.status(400).send("The character sheet requested does not exist");
  });
})

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

async function sendResetPasswordEmail (to, token, userID){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'Reset your RPGSheets Password',
    text: 'this is the link: http://localhost:3000/resetPassword?' + token,
    html: 'this is the link: <a href=\"http://localhost:3000/verify/' + token + '/' + userID + '\"> here </a>'
  }
  await sgMail.send(msg)
}

module.exports = router;


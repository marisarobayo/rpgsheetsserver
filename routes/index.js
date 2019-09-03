var express = require('express');
var router = express.Router();
const nano = require('nano')('http://admin:admin@localhost:5984');
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
var cryptoRandomString = require('crypto-random-string');

// New player registration
router.post('/register', async function(req, res, next) {
  username = req.body.username;
  email = req.body.email;
  displayName = req.body.email;
  password = req.body.password;
  characterSheet = req.body.characterSheet;

  let user = {};

  users = nano.db.use('users');

  //checking if username is taken
  view = await users.view('users', 'by_username', {
    'key': username
  })

  console.log(view);
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

  user.password = password;
  user.isVerified = false;

  if (characterSheet){
     //TODO hacer que se asigne la ficha que sea asociada a la character sheet
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

  await sendVerificationEmail(email, user.verificationToken);

  res.status(200).send("Player created.")
});

router.post('/verify/:verificationToken', async function (req, res, next){
  verificationToken = req.params.verificationToken;


});

async function sendVerificationEmail (to, token){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'Activate your RPGSheets Account',
    text: 'this is the link: http://localhost:3000/verify?' + token,
    html: 'this is the link: <a href=\"http://localhost:3000/verify?' + token + '\"> here </a>'
  }
  await sgMail.send(msg)
}

// Initializes the database
async function createDB(){
  await nano.db.create('users');
  await nano.db.create('players');
  users = nano.db.use('users');

  //design document that can search by username and email
  await users.insert({
    "views": {
      "by_username":
      { "map": function(doc) { emit(doc.username, doc._id)}},
      "by_email":
      { "map": function(doc) { emit(doc.email, doc._id)}},
      "by_verification_token":
      { "map": function(doc) { emit(doc.verificationToken, doc._id)}},
    }
  },
  '_design/users'); //the _design makes nano understand this is a design document (it assumes they all have the _design/)
}

async function initialize(){

  /*if(body.includes('users')){
    await nano.db.destroy('users');
    await nano.db.destroy('players');
  }*/

  let body = await nano.db.list();
  if(!body.includes('users')){
    createDB();
  }

  
}

//If data is not initialized, do it now


module.exports = router;


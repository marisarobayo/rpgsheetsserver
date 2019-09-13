var express = require('express');
var router = express.Router();
var passport = require('passport');
const jwt = require('jsonwebtoken');
const fs = require('fs');

var js = require('../app.js');
var users = require('../models/user.js');
var CharacterSheet = require('../models/characterSheet.js').CharacterSheet;
var DWCharacterSheet = require('../models/dungeonWorldCS.js').DWCharacterSheet;

var User = users.User;
var Player = users.Player;
var GM = users.GM;
var mongoose = js.mongoose;


router.post('/sheets', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
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

    res.status(201).send("Character sheet created");
  }
  

})

router.get('/sheets', passport.authenticate('jwt', {session: false}), async function (req, res, next) {

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

router.get('/sheets/:id', passport.authenticate('jwt', {session: false}), async function (req, res, next) {

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


async function assignPlayerToSheet(player, characterSheet){
  characterSheet.belongsTo.push(player._id);
  await characterSheet.save();
}

module.exports = router;

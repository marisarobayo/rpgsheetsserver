var express = require('express');
var router = express.Router();
var passport = require('passport');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path')

var js = require('../app.js');
var users = require('../models/user.js');
var CharacterSheet = require('../models/characterSheet.js').CharacterSheet;
var DWCharacterSheet = require('../models/dungeonWorldCS.js').DWCharacterSheet;

var User = users.User;
var Player = users.Player;
var GM = users.GM;
var mongoose = js.mongoose;
var cloudinary = require('cloudinary').v2;

router.post('/sheets', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  name = req.body.name;
  players = req.body.players; //TODO deprecated
  image = req.files.image;
  game = req.body.game;

  if(!name){
    res.status(400).send('Name cannot be empty');
    return;
  }

  characterSheet = new CharacterSheet();
  characterSheet.name = name;
  characterSheet.belongsTo = [];

  
  // Add players that can see and edit the sheet
  playersCorrect = true;
  for(player in players){
    await Player.findById(player).catch((err) => {
      playersCorrect = false;
    })
    characterSheet.belongsTo.push(player._id);
  }
  if(!playersCorrect){
    res.status(400).send("Players not correct");
    return;
  }

  // If not a GM, add themselves to the character sheet
  player = await getPlayer(req.user);
  if(player){
    characterSheet.belongsTo.push(player._id);
  }
  
  // Checking the image format first
  if(image){
    if(image.mimetype != "image/jpeg" && image.mimetype != "image/png" && image.mimetype != "image/gif"){
      res.status(400).send("Image format not correct");
      return;
    }
  }

  await characterSheet.save();
  
  // We have to add the picture afterwards since we need the id
  // We also need to move it first to a local filesystem before uploading
  if(image){
    // Base image folder
    try {
      fs.mkdirSync('./public/characterSheetImages');
    } catch(err) {
      //res.status(500).send("There was an error uploading your image");
      //If it already exists thats fine
      //return;
    };

    // Folder for this character sheet
    try {
      fs.mkdirSync('./public/characterSheetImages' + "/" + characterSheet._id.toString())
    } catch(err) {
      //res.status(500).send("There was an error uploading your image");
      //If it already exists thats fine
      //return;
    };
    let route = './public/characterSheetImages' + "/" + characterSheet._id.toString()+ "/" + image.name;
    await image.mv(route).catch((err) => {
      console.log("could not");
      res.status(500).send("There was an error uploading your image");
      return;
    })

    await cloudinary.uploader.upload("./public/characterSheetImages" + "/" + characterSheet._id.toString()+ "/" + image.name, function(err, image) {
      if(err){
        console.log(err);
      } else {
        characterSheet.displayImage = image.url;
        characterSheet.displayImageID = image.public_id;
        characterSheet.save();
      }
    });
  }

  //TODO bad design, must refactor
  if(game == "dw"){
    cs = new DWCharacterSheet();
    cs.characterSheet = characterSheet._id;
  }

  cs.save();

  res.status(201).send("Character sheet created");
})

router.get('/sheets', passport.authenticate('jwt', {session: false}), async function (req, res, next) {

  token = jwt.decode(req.header('token'));
  userid = token._id;
  user = await User.findById(userid);

  player = await getPlayer(user);
  if(player){
    sheets = await CharacterSheet.find({belongsTo: {$in: [player._id]}});
    res.status(200).send(sheets);
  } else {
    sheets = await CharacterSheet.find();
    res.status(200).send(sheets);
  }
})

router.get('/sheets/:id', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  token = jwt.decode(req.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;

  user = req.user;
  player = await getPlayer(user);
  sheet = await CharacterSheet.findById(characterSheetID).catch((err) => {
    res.status(400).send("The character sheet requested does not exist");
  });


  //If its a player check if they have permission to watch this
  if(player){
    if(!sheet.belongsTo.includes(player._id)){
      res.status(400).send("You do not have permission to see this");
    }
  };

  

   //TODO bad design, must refactor
  let game = await getGame(sheet);
  if(game == "dw"){
    /*let dwCharacterSheet = await DWCharacterSheet.findOne({characterSheet : character._id});
    sheet.detail = dwCharacterSheet;
    console.log(sheet);
    console.log(dwCharacterSheet);*/

    sheet = await DWCharacterSheet.findOne({characterSheet : sheet._id}).populate('characterSheet').exec();
  }

  res.status(200).send(sheet);
})

router.delete('/sheets/:id', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  token = jwt.decode(req.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;

  user = req.user;
  player = await getPlayer(user);

  sheet = await CharacterSheet.findById(characterSheetID).catch((err) => {
    res.status(400).send("The character sheet requested does not exist");
  });

  //If its a player check if they have permission to watch this
  if(player){
    if(!sheet.belongsTo.includes(player._id)){
      res.status(400).send("You do not have permission to see this");
    }
  };

  let route = './public/characterSheetImages' + "/" + sheet._id.toString();
  deleteFolderRecursive(route);

  cloudinary.uploader.destroy(sheet.displayImageID);

  //TODO bad design, must refactor
  if(await getGame(sheet) == "dw"){
    dwCharacterSheet = DWCharacterSheet.find({characterSheet : sheet._id});
    await DWCharacterSheet.deleteOne({characterSheet : sheet._id});
    await CharacterSheet.findByIdAndDelete(characterSheetID);
  }
  res.status(200).send("Deleted.");

})

router.put('/sheets/:id', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  token = jwt.decode(req.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;
  sheet = req.body.sheet;
  user = req.user;

  player = await getPlayer(user);

  oldSheet = await CharacterSheet.findById(characterSheetID).catch((err) => {
    res.status(400).send("The character sheet does not exist");
    return;
  });

  //If its a player check if they have permission to watch this
  if(player){
    if(!oldSheet.belongsTo.includes(player._id)){
      res.status(400).send("You do not have permission to update this");
    }
  };

  // First we update the character sheet itself

  oldSheet.name = sheet.name;
  oldSheet.belongsTo = sheet.belongsTo;

   //TODO bad design, must refactor
  let game = await getGame(sheet);
  if(game == "dw"){
    let dwCharacterSheet = await DWCharacterSheet.findOne({characterSheet : oldSheet._id});
    dwCharacterSheet.strength = sheet.strength;
    dwCharacterSheet.constitution = sheet.constitution;
    dwCharacterSheet.dexterity = sheet.dexterity;
    dwCharacterSheet.intelligence = sheet.intelligence;
    dwCharacterSheet.wisdom = sheet.wisdom;
    dwCharacterSheet.charisma = sheet.charisma;
    dwCharacterSheet.strWeak = sheet.strWeak;
    dwCharacterSheet.dexWeak = sheet.dexWeak;
    dwCharacterSheet.conWeak = sheet.conWeak;
    dwCharacterSheet.intWeak = sheet.intWeak;
    dwCharacterSheet.wisWeak = sheet.wisWeak;
    dwCharacterSheet.chaWeak = sheet.chaWeak;
    dwCharacterSheet.maxhp = sheet.maxhp;
    dwCharacterSheet.damage = sheet.damage;
    dwCharacterSheet.class = sheet.class;
    dwCharacterSheet.level = sheet.level;
    dwCharacterSheet.xp = sheet.xp;
    dwCharacterSheet.race = sheet.race;
    dwCharacterSheet.raceMove = sheet.raceMove;
    dwCharacterSheet.alignment = sheet.alignment;
    dwCharacterSheet.moves = sheet.moves;
    dwCharacterSheet.equipment = sheet.equipment;
    dwCharacterSheet.armor = sheet.armor;
    dwCharacterSheet.bonds = sheet.bonds;

    dwCharacterSheet.save();
  }

  //oldSheet.save();
  res.status(200).send(sheet);
})

router.put('/sheets/:id/invite', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  token = jwt.decode(req.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;
  users = req.body.players;
  user = req.user;

  player = await getPlayer(user);

  sheet = await CharacterSheet.findById(characterSheetID).catch((err) => {
    res.status(400).send("The character sheet does not exist");
    return;
  });

  //If its a player check if they have permission to watch this
  if(player){
    if(!sheet.belongsTo.includes(player._id)){
      res.status(400).send("You do not have permission to update this");
    }
  };


  for(let i = 0; i < users.length; i++){
    player = await Player.findOne({user: users[i].id});
    console.log(player);
    if(!sheet.belongsTo.includes(player._id)){
      sheet.belongsTo.push(player.id);
    }
  }
  /*await users.forEach(async function(user) {
    player = await Player.findOne({user: user.id});
    console.log(player);
    if(!sheet.belongsTo.includes(player._id)){
      sheet.belongsTo.push(player.id);
    }
  })*/
  console.log(sheet);
  sheet.save();
  res.status(200).send(sheet);
})


async function assignPlayerToSheet(player, characterSheet){
  characterSheet.belongsTo.push(player._id);
  await characterSheet.save();
}

async function getPlayer(user){
  let player = await Player.findOne({user: user._id}).catch((err) => {
    player = null
  });

  return player;
}

async function getGame(sheet){
  let dwCharacterSheet = await DWCharacterSheet.find({characterSheet : sheet._id});
  if (dwCharacterSheet != null){
    return "dw";
  }
  return "";
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};

module.exports = router;

var express = require('express');
var router = express.Router();
var passport = require('passport');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path')
var sanitize = require('sanitize-filename');

var js = require('../app.js');
var users = require('../models/user.js');
var CharacterSheet = require('../models/characterSheet.js').CharacterSheet;
var DWCharacterSheet = require('../models/dungeonWorldCS.js').DWCharacterSheet;

var User = users.User;
var Player = users.Player;
var GM = users.GM;
var mongoose = js.mongoose;
var cloudinary = require('cloudinary').v2;
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

router.post('/sheets', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  name = req.body.name;
  players = req.body.players; //TODO deprecated
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

  await characterSheet.save();
  
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

router.put('/sheets/:id/image', passport.authenticate('jwt', {session: false}), async function (req, res, next) {
  token = jwt.decode(req.header('token'));
  userid = token._id;
  characterSheetID = req.params.id;
  user = req.user;
  image = req.files.image;

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

  //now we update the image if it exists
  try {
    if(image){
      await createOrUpdateCharacterSheetPicture(oldSheet,image); //This changes the oldSheet object with the new iamge
      await oldSheet.save();
      res.status(200).send(oldSheet);
    } else {
      res.status(500).send("No image");
    }
  } catch (err) {
    res.status(500).send("There was an error uploading your image");
  }

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
  await oldSheet.save();

   //TODO bad design, must refactor
  let game = await getGame(sheet);
  if(game == "dw"){
    //updating each parameter separately
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
    if(!sheet.belongsTo.includes(player._id)){
      sheet.belongsTo.push(player.id);
      sendInviteEmail(users[i].email, sheet.id);
    }
  }
  
  sheet.save();
  res.status(200).send(sheet);
})

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

async function createOrUpdateCharacterSheetPicture(characterSheet, image){

  // Checking the image format first
  if(image){
    if(image.mimetype != "image/jpeg" && image.mimetype != "image/png" && image.mimetype != "image/gif"){
      throw "Image format not correct";
    }
  }

  // First of all we need to move the image to a local filesystem

  // Base image folder, checking if it does exist, if it does not, create!

  await fs.stat('./public/characterSheetImages', function(err, stat) {
    if(err && err.code === "ENOENT"){
      fs.mkdirSync('./public/characterSheetImages');
    }
  })


  // Folder for this character sheet, same
  await fs.stat('./public/characterSheetImages' + "/" + characterSheet._id.toString(), function(err, stat) {
    if(err && err.code === "ENOENT"){
      fs.mkdirSync('./public/characterSheetImages' + "/" + characterSheet._id.toString());
    }
  })

  let name = sanitize(image.name);

  let route = './public/characterSheetImages' + "/" + characterSheet._id.toString()+ "/" + name;
  await image.mv(route).catch((err) => {
    throw err;
  })

  //Check if this character sheet already had a picture, if yes, we have to delete it both from the filesystem and cloudinary
  if(characterSheet.displayImageFile){
    fs.unlinkSync('./public/characterSheetImages' + "/" + characterSheet._id.toString()+ "/" + characterSheet.displayImageFile) 
    await cloudinary.uploader.destroy(characterSheet.displayImageID, function(err, result){
      if(err){
        throw err;
      }
    })
  }

  await cloudinary.uploader.upload("./public/characterSheetImages" + "/" + characterSheet._id.toString()+ "/" + name, async function(err, image) {
    if(err){
      throw err;
    } else {
      characterSheet.displayImage = image.url;
      characterSheet.displayImageID = image.public_id;
      characterSheet.displayImageFile = name;
    }
  });
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { 
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
};


async function sendInviteEmail (to, sheetID){
  const msg = {
    to: email,
    from: 'rpgSheets@gmail.com',
    subject: 'RPGSheets: A character sheet has been shared with you',
    text: 'You can check it out here: https://rpgsheets.herokuapp.com/main/' + sheetID + "/main",
    html: 'You can check it out here: <a href=\"https://rpgsheets.herokuapp.com/main/' + sheetID + "/main\">"
  }
  await sgMail.send(msg)
}

module.exports = router;

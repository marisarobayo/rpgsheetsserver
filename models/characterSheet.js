var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Player = require('./user.js').Player;

var characterSheetSchema = new Schema({
    name: String,
    displayImage: String,
    displayImageID: String,
    belongsTo: [{type: Schema.Types.ObjectId, ref: Player}]
});

var CharacterSheet = mongoose.model('CharacterSheet', characterSheetSchema);

exports.CharacterSheet = CharacterSheet;


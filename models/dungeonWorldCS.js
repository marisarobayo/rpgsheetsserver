var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var CharacterSheet = require('./characterSheet.js').CharacterSheet;

var dwAbilitySchema = new Schema({
    name: String,
    description: String
});

var dwEquipmentSchema = new Schema({
    name: String,
    description: String,
    weight: Number,
    tags: String,
    amount: Number
})

var dwBondSchema = new Schema({
    id: Number,
    text: String
})

var dungeonWorldSchema = new Schema({
    characterSheet: {type: Schema.Types.ObjectId, ref: CharacterSheet},
    strength: Number,
    constitution: Number,
    dexterity: Number,
    intelligence: Number,
    wisdom: Number,
    charisma: Number,
    strWeak: Boolean,
    dexWeak: Boolean,
    conWeak: Boolean,
    intWeak: Boolean,
    wisWeak: Boolean,
    chaWeak: Boolean,
    maxhp: Number,
    damage: Number,
    class: String,
    level: Number,
    xp: Number,
    race: String,
    raceMove: String,
    alignment: String,
    moves: [dwAbilitySchema],
    equipment: [dwEquipmentSchema],
    armor: Number,
    bonds: [dwBondSchema]
})

var DWCharacterSheet = mongoose.model('DWCharacterSheet', dungeonWorldSchema);

exports.DWCharacterSheet = DWCharacterSheet;


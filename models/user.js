var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
    username: String,
    email: String,
    displayName: String,
    passwordHash: String,
    passwordSalt: String,
    verificationToken: String,
    verificationTokenExpireDate: Date,
    isVerified: Boolean,
    passwordResetToken: String,
    passwordResetTokenExpireDate: Date
})

var User = mongoose.model('User', userSchema);

var playerSchema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'}
})

var Player = mongoose.model('player', playerSchema);

var gmSchema = new Schema({
    user: {type: Schema.Types.ObjectId, ref: 'User'}
})

var GM = mongoose.model('GM', gmSchema);

exports.User = User;
exports.Player = Player;
exports.GM = GM;
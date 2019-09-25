var passport = require('passport'), LocalStrategy = require('passport-local').Strategy;
const jwt = require('jsonwebtoken');
var crypto = require('crypto');
var passportJWT = require('passport-jwt');
const JWTStrategy   = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;

const User = require('../models/user.js').User;
const mongoose = require('../app.js').mongoose;

const jwtSecret = process.env.RPGSHEETS_JWT_SECRET;

// Login strategy with Passport
passport.use(new LocalStrategy(
    function(username, password, done) {
        User.findOne({username: username}, function(err,user){
            if(err){
                return done(err);
            }
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            
            if(err){
                return done(err);
            }
            if (!validPassword(user, password)) {
                return done(null, false, { message: 'Incorrect password.' });
            }

            return done(null, user); 
            
      })
    }
  ));


passport.use(new JWTStrategy({
    jwtFromRequest: ExtractJWT.fromHeader('token'),
    secretOrKey   : jwtSecret
    },function (jwtPayload, done) {
        User.findById(jwtPayload._id, function(err, user){
            if(err){
                return done(err);
            }
            return done(null, user);
        })
    }
));

function validPassword(user, password){
    return user.passwordHash == sha512(password, user.passwordSalt)
}

function sha512(password, salt){
    var hash = crypto.createHmac('sha512', salt);
    hash.update(password);
    var value = hash.digest('hex');
    return value;
}

exports.sha512 = sha512;
exports.jwtSecret = jwtSecret;
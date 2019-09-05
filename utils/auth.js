var passport = require('passport'), LocalStrategy = require('passport-local').Strategy;
const jwt = require('jsonwebtoken');
var crypto = require('crypto');
var passportJWT = require('passport-jwt');
const JWTStrategy   = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;
const nano = require('nano')('http://admin:admin@localhost:5984');

const jwtSecret = process.env.RPGSHEETS_JWT_SECRET;

// Login strategy with Passport
passport.use(new LocalStrategy(
    function(username, password, done) {
        users = nano.db.use('users');
        users.view('users', 'by_username', {
        'key': username
        }, function(err, user){
            if(err){
                return done(err);
            }
            if (!user) {
                return done(null, false, { message: 'Incorrect username.' });
            }
            users.get(user.rows[0].id, function(err, user){
                if(err){
                    return done(err);
                }
                if (!validPassword(user, password)) {
                    return done(null, false, { message: 'Incorrect password.' });
                }

                return done(null, user); 
            })
      })
    }
  ));

passport.use(new JWTStrategy({
    jwtFromRequest: ExtractJWT.fromHeader('token'),
    secretOrKey   : jwtSecret
    },function (jwtPayload, done) {
        users = nano.db.use('users');
        users.get(jwtPayload._id).then(user => {
            return done(null, user);
        }).catch(err => {
            return done(err);
        });
                
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
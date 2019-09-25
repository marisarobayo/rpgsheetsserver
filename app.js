var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var cors = require('cors');
var logger = require('morgan');
var http = require('http');
var https = require('https');
var auth = require('./utils/auth.js')
var passport = require('passport');
const expressFileUpload = require('express-fileupload');
var fs = require('fs');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/rpgsheets', {useNewUrlParser: true});

const errorHandler = require('errorhandler');

var app = express();

var port = process.env.PORT || 3000;
const IS_PRODUCTION = true;
var corsOptions = {
  origin: '*',
  optionsSuccessStatus:200
};


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
//app.use(cors(corsOptions));
app.use(passport.initialize());
app.use(expressFileUpload());

exports.app = app;
exports.mongoose = mongoose;

var indexRouter = require('./routes/index');
var sheetsRouter = require('./routes/sheets');

app.use('/', indexRouter);
app.use('/', sheetsRouter);

if(!IS_PRODUCTION) {
  app.use(errorHandler());
  app.use(cors());
  app.listen(port, () => console.log(`Example app listening on port ${port}!`))
} else {
  app.use(cors());
  https.createServer({
    key: fs.readFileSync('rpgsheets.key'),
    cert: fs.readFileSync('rpgsheets.crt')
  }, app).listen(port, function (){
    console.log(`Server ready on port ${port} `);
  })
}


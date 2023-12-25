var express = require('express');
var router = express.Router();
var users = require('../models/userModel')
var sonModel = require('../models/songModel')
var playlistModel = require('../models/playlistModel')
var passport = require('passport')
var localStrategy = require('passport-local')
var multer = require('multer')
var id3 = require('node-id3')
var crypto = require('crypto')
const { Readable } = require('stream')
passport.use(new localStrategy(users.authenticate()))
const mongoose = require('mongoose');
const songModel = require('../models/songModel');
const userModel = require('../models/userModel');

mongoose.connect('mongodb://0.0.0.0/spt-n15').then(() => {
  console.log('connected to database')
}).catch(err => {
  console.log(err)
})

const conn = mongoose.connection

var gfsBucket, gfsBucketPoster
conn.once('open', () => {
  gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'audio'
  })
  gfsBucketPoster = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'poster'
  })
})

/* user authentication routes */

router.post('/register', async (req, res, next) => {




  var newUser = {
    //user data here
    username: req.body.username,
    email: req.body.email
    //user data here
  };
  users
    .register(newUser, req.body.password)
    .then((result) => {
      passport.authenticate('local')(req, res, async () => {
        const songs = await songModel.find()
        const defaultPlaylist = await playlistModel.create({
          name: req.body.username,
          owner: req.user._id,
          songs: songs.map(song => song._id)
        })
        const newUser = await userModel.findOne({
          _id: req.user._id
        })

        newUser.playlist.push(defaultPlaylist._id)

        await newUser.save()

        res.redirect('/');
      });
    })
    .catch((err) => {
      res.send(err);
    });
});

router.get('/auth', (req, res, next) => {
  res.render('register')
})

router.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
  }),
  (req, res, next) => { }
);

router.get('/logout', (req, res, next) => {
  if (req.isAuthenticated())
    req.logout((err) => {
      if (err) res.send(err);
      else res.redirect('/');
    });
  else {
    res.redirect('/');
  }
});

function isloggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  else res.redirect('/auth');
}


function isAdmin(req, res, next) {
  if (req.user.isAdmin) return next()
  else return res.redirect('/')
}

/* user authentication routes */


/* GET home page. */
router.get('/', isloggedIn, async function (req, res, next) {
  const currentUser = await userModel.findOne({
    _id: req.user._id
  }).populate('playlist').populate({
    path: 'playlist',
    populate: {
      path: 'songs',
      model: 'song'
    }
  })
  res.render('index', { currentUser });
});

router.get('/poster/:posterName', (req, res, next) => {
  gfsBucketPoster.openDownloadStreamByName(req.params.posterName).pipe(res)
})



const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
router.post('/uploadMusic', isloggedIn, isAdmin, upload.array('song'), async (req, res, next) => {



  await Promise.all(req.files.map(async file => {
    const randomName = crypto.randomBytes(20).toString('hex')
    const songData = id3.read(file.buffer)
    Readable.from(file.buffer).pipe(gfsBucket.openUploadStream(randomName))
    Readable.from(songData.image.imageBuffer).pipe(gfsBucketPoster.openUploadStream(randomName + 'poster'))


    await songModel.create({
      title: songData.title,
      artist: songData.artist,
      album: songData.album,
      size: file.size,
      poster: randomName + 'poster',
      fileName: randomName
    })
  }))
  res.send('songs uploaded')
})
router.get('/uploadMusic', isloggedIn, isAdmin, (req, res, next) => {
  // console.log(req.user)
  res.render('uploadMusic')
})
router.get('/stream/:musicName', async (req, res, next) => {
  const currentSong = await songModel.findOne({
    fileName: req.params.musicName
  })
  console.log(currentSong)

  const stream = gfsBucket.openDownloadStreamByName(req.params.musicName)

  res.set('Content-Type', 'audio/mpeg')
  res.set('Content-Length', currentSong.size + 1)
  res.set('Content-Range', `bytes 0-${currentSong.size - 1}/${currentSong.size}`)
  res.set('Content-Ranges', 'byte')
  res.status(206)

  stream.pipe(res)

})
router.get('/search', (req, res, next) => {
  res.render('search')
})
router.post('/search', async (req, res, next) => {
  const searhedMusic = await songModel.find({
    title: { $regex: req.body.search }
  })
  res.json({
    songs: searhedMusic
  })

})
module.exports = router;
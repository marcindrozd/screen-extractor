var AWS = require('aws-sdk');
var fs = require('fs-extra');
var uuidv4 = require('uuid/v4');
var childProcess = require('child_process');
var archiver = require('archiver');
var async = require('async');
var request = require('request');

// Creating AWS client
var s3 = new AWS.S3();

exports.handler = (event, context, callback) => {
  process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT'];

  var body = event.body;
  var saveFolder = uuidv4();
  var folderPath = "/tmp/" + saveFolder;
  var bucket = body.bucket;
  var videoPath = body.videoPath;
  var frameExtractId = body.frameExtractId;
  var videoFilename = 'video.mp4';
  var zipFilename = 'video.zip';

  function makeDirectory(callback) {
    fs.mkdir(folderPath, function(error) {
      callback(error);
    })
  }

  function getVideo(callback) {
    s3.getObject({
      Bucket: bucket,
      Key: videoPath + '/' + videoFilename
    }, function(error, data) {
      callback(error, data)
    });
  }

  function saveFile(data, callback) {
    fs.writeFile(folderPath + '/' + videoFilename, data.Body, function(error) {
      callback(error)
    });
  }

  function prepareFramesToExtract(callback) {
    function msToTime(duration) {
      var milliseconds = parseInt(duration % 1000)
          , seconds = parseInt((duration / 1000) % 60)
          , minutes = parseInt((duration / (1000 * 60)) % 60)
          , hours = parseInt((duration / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    }

    var framesToExtract = body.framesToExtract.map(
      function(frame) {
        return msToTime(frame * 1000)
      }
    );
    callback(null, framesToExtract)
  }

  function extractFrames(framesToExtract, callback) {
    try {
      framesToExtract.forEach(function(frame) {
        childProcess.execSync("ffmpeg -i " + folderPath + "/" + videoFilename + " -ss " + frame + " -vframes 1 -f image2 '" + folderPath + "/image" + Date.now() + ".jpg'");
      });

      callback();
    }
    catch(err) {
      callback(err)
    }
  }

  function zipFiles(callback) {
    var output = fs.createWriteStream(folderPath + '/' + zipFilename);
    var archive = archiver('zip');

    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
      callback();
    });

    archive.on('error', function(err) {
      callback(err)
    });

    archive.pipe(output);

    fs.readdirSync(folderPath).forEach(file => {
      if (file === zipFilename) { return }
      console.log('Archiving', file);
      archive.append(fs.createReadStream(folderPath + '/' + file), { name: file })
    });

    archive.finalize()
  }

  function uploadFile(callback) {
    console.log('Uploading...', folderPath + '/' + zipFilename)
    var readStream = fs.createReadStream(folderPath + '/' + zipFilename);

    s3.upload({
      Bucket: bucket,
      Key: videoPath + '/' + zipFilename,
      ContentType: 'application/zip',
      Body: readStream,
    })
    .send(function (error, result) {
      readStream.close();
      console.log('upload completed.');
      callback(error, result);
    });
  }

  function sendUrltoEndpoint(response, callback) {
    request.put(
      'https://' + body.replyTo + '/api/v2/frame_extracts/' + frameExtractId + '/callback',
      { json: { zipFileUrl: response.Location } },
      function (error, response, body) {
        if (!error && response.statusCode == 200) {
          callback()
        } else {
          callback(error)
        }
      }
    );
  }

  async.waterfall([
    makeDirectory,
    getVideo,
    saveFile,
    prepareFramesToExtract,
    extractFrames,
    zipFiles,
  ], function(error, result) {
    if (error) {
      fs.removeSync(folderPath);
      throw error
    }
    console.log('Removing directory')
    fs.removeSync(folderPath);
    console.log('All done!');
  });
}

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
  process.env['PATH'] = process.env['PATH'] + ':' + process.env['LAMBDA_TASK_ROOT']

  var saveFolder = uuidv4();
  var folderPath = "/tmp/" + saveFolder;
  var bucket = event.bucket;
  var videoPath = event.videoPath;
  var frameExtractId = event.frameExtractId;
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
    var framesToExtract = event.framesToExtract.map(
      function(frame) {
        timeframe = parseFloat(frame).toString()
        return timeframe.length === 1 ? "0" + timeframe : timeframe
      }
    );
    callback(null, framesToExtract)
  }

  function extractFrames(framesToExtract, callback) {
    try {
      framesToExtract.forEach(function(frame) {
        childProcess.execSync(__dirname + "/bin/ffmpeg -i " + folderPath + "/" + videoFilename + " -ss 00:00:" + frame + " -vframes 1 -f image2 '" + folderPath + "/image" + Date.now() + ".jpg'");
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
      'http://localhost:3000/api/v2/frame_extracts/' + frameExtractId + '/callback',
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
    uploadFile,
    sendUrltoEndpoint,
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
